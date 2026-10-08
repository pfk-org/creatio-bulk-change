import { Injectable } from '@angular/core';
import {
  ComparisonType,
  DataSchema,
  DataSourceParameters,
  FilterGroup,
  JsonObject,
  LookupValue,
  Model,
  ModelParameterType,
  RightsService,
  SysValuesService,
} from '@creatio-devkit/common';

import {
  BULK_CHANGE_OPERATION_CODE,
  BulkChangeProgress,
  BulkChangeResult,
  BulkChangeValue,
  EditableColumn,
  GridColumnConfig,
  GridSelectionState,
  ID_PAGE_SIZE,
} from './bulk-change.models';

/**
 * Options of one bulk change run.
 */
export interface BulkChangeRunOptions {
  entitySchemaName: string;
  column: EditableColumn;
  value: BulkChangeValue;
  recordIds: string[];
  batchSize: number;
  onProgress?: (progress: BulkChangeProgress) => void;
  isCancelled?: () => boolean;
}

const LOOKUP_PAGE_SIZE = 30;
const MAX_ERRORS_TO_KEEP = 20;

/**
 * Data access of the bulk change component. Works only through the public `@creatio-devkit/common` Model API.
 *
 * Why records are updated in batches by Id instead of one UpdateQuery by the list filter:
 * the server loads every record matched by an UpdateQuery into one entity collection
 * (`MaxEntityRowCount` = 20 000, more records fail the whole request), saves them one by one
 * and wraps them into one transaction. Small batches by Id keep each request far below that
 * limit, allow progress and cancellation, and limit the rollback of a failed batch.
 */
@Injectable({ providedIn: 'root' })
export class BulkChangeDataService {
  private readonly _models = new Map<string, Promise<Model>>();
  private readonly _schemas = new Map<string, Promise<DataSchema>>();

  /**
   * Checks the `PfkCanBulkChange` system operation for the current user.
   */
  public async canUseBulkChange(): Promise<boolean> {
    try {
      return await new RightsService().getCanExecuteOperation(BULK_CHANGE_OPERATION_CODE);
    } catch {
      return false;
    }
  }

  public getSchema(entitySchemaName: string): Promise<DataSchema> {
    let schema = this._schemas.get(entitySchemaName);
    if (!schema) {
      schema = this._getModel(entitySchemaName).then((model) => model.getSchema());
      schema.catch(() => this._schemas.delete(entitySchemaName));
      this._schemas.set(entitySchemaName, schema);
    }
    return schema;
  }

  /**
   * Reads the columns the current user configured for a list at runtime (list settings, "+" in the
   * list header). The platform stores them in `SysProfileData` with the key `<PageSchema>__<Grid>`.
   * Returns `null` when the user has no profile for the list.
   */
  public async loadGridProfileColumns(pageSchemaName: string, gridName: string): Promise<GridColumnConfig[] | null> {
    if (!pageSchemaName || !gridName) {
      return null;
    }
    const userId = (await new SysValuesService().loadSysValues())?.user?.value;
    const filter = new FilterGroup();
    filter.addSchemaColumnFilterWithParameter(ComparisonType.Equal, 'Key', `${pageSchemaName}__${gridName}`);
    if (userId) {
      filter.addSchemaColumnFilterWithParameter(ComparisonType.Equal, 'SysUser', userId);
    }
    const model = await this._getModel('SysProfileData');
    const rows = (await model.load({
      attributes: ['ObjectData'],
      parameters: [{ type: ModelParameterType.Filter, value: filter }],
      options: { pagingConfig: { rowsOffset: 0, rowCount: 1 } },
    })) as JsonObject[];
    const objectData = rows[0]?.['ObjectData'];
    return typeof objectData === 'string' && objectData ? parseGridProfileColumns(objectData) : null;
  }

  /**
   * Searches lookup values by the primary display column of the referenced schema.
   */
  public async searchLookupValues(referenceSchemaName: string, searchText: string): Promise<LookupValue[]> {
    const schema = await this.getSchema(referenceSchemaName);
    const idColumn = schema.primaryAttributeName ?? 'Id';
    const displayColumn = schema.primaryDisplayAttributeName ?? 'Name';
    const parameters: DataSourceParameters = [];
    const text = searchText.trim();
    if (text) {
      const filter = new FilterGroup();
      filter.addSchemaColumnFilterWithParameter(ComparisonType.Contain, displayColumn, text);
      parameters.push({ type: ModelParameterType.Filter, value: filter });
    }
    const model = await this._getModel(referenceSchemaName);
    const rows = (await model.load({
      attributes: [idColumn, displayColumn],
      parameters,
      options: {
        pagingConfig: { rowsOffset: 0, rowCount: LOOKUP_PAGE_SIZE },
        sortingConfig: { columns: [{ columnName: displayColumn, direction: 'asc' }] },
      },
    })) as JsonObject[];
    return rows.map((row) => ({
      value: String(row[idColumn]),
      displayValue: row[displayColumn] == null ? '' : String(row[displayColumn]),
    }));
  }

  /**
   * Resolves the Ids of the records to change.
   *
   * - A specific selection is used exactly as selected; list filters are never applied to it.
   * - "Select all" is resolved by the current list filters page by page (the ESQ row limit does not
   *   apply), excluding the records the user unselected. Without list filters nothing is resolved,
   *   so a run can never fall back to the whole table.
   *
   * Stops after `limit + 1` Ids to detect an exceeded limit cheaply.
   */
  public async resolveRecordIds(
    entitySchemaName: string,
    selectionState: GridSelectionState | null,
    listFilters: FilterGroup | JsonObject | null,
    limit: number,
  ): Promise<string[]> {
    if (selectionState?.type === 'specific') {
      return [...new Set(selectionState.selected)];
    }
    if (selectionState?.type !== 'all' || !listFilters) {
      return [];
    }
    const schema = await this.getSchema(entitySchemaName);
    const idColumn = schema.primaryAttributeName ?? 'Id';
    const parameters: DataSourceParameters = [{ type: ModelParameterType.Filter, value: listFilters }];
    if (selectionState.unselected.length) {
      const unselectedFilter = new FilterGroup();
      unselectedFilter.addSchemaColumnInFilterWithParameters(
        ComparisonType.Not_equal,
        idColumn,
        selectionState.unselected,
      );
      parameters.push({ type: ModelParameterType.Filter, value: unselectedFilter });
    }
    const model = await this._getModel(entitySchemaName);
    const ids: string[] = [];
    let rowsOffset = 0;
    while (ids.length <= limit) {
      const rows = (await model.load({
        attributes: [idColumn],
        parameters,
        options: {
          pagingConfig: { rowsOffset, rowCount: ID_PAGE_SIZE },
          sortingConfig: { columns: [{ columnName: idColumn, direction: 'asc' }] },
        },
      })) as JsonObject[];
      ids.push(...rows.map((row) => String(row[idColumn])));
      if (rows.length < ID_PAGE_SIZE) {
        break;
      }
      rowsOffset += rows.length;
    }
    return ids;
  }

  /**
   * Sets the value to the records in batches. A failed batch is retried record by record,
   * so one record without edit rights does not block the others and is reported separately.
   */
  public async run(options: BulkChangeRunOptions): Promise<BulkChangeResult> {
    const { entitySchemaName, column, recordIds, onProgress, isCancelled } = options;
    const batchSize = Math.max(1, options.batchSize);
    const model = await this._getModel(entitySchemaName);
    const dto = { [column.name]: toModelValue(options.value) } as JsonObject;
    const result: BulkChangeResult = {
      total: recordIds.length,
      processed: 0,
      updated: 0,
      failed: 0,
      stopped: false,
      errors: [],
    };
    for (let offset = 0; offset < recordIds.length; offset += batchSize) {
      if (isCancelled?.()) {
        result.stopped = true;
        break;
      }
      const batch = recordIds.slice(offset, offset + batchSize);
      const batchError = await this._updateRecords(model, dto, batch);
      if (batchError === null) {
        result.updated += batch.length;
      } else if (batch.length === 1) {
        this._registerFailure(result, batch[0], batchError);
      } else {
        for (const recordId of batch) {
          const recordError = await this._updateRecords(model, dto, [recordId]);
          if (recordError === null) {
            result.updated++;
          } else {
            this._registerFailure(result, recordId, recordError);
          }
        }
      }
      result.processed += batch.length;
      onProgress?.({ ...result });
    }
    return result;
  }

  private _getModel(entitySchemaName: string): Promise<Model> {
    let model = this._models.get(entitySchemaName);
    if (!model) {
      model = Model.create(entitySchemaName);
      model.catch(() => this._models.delete(entitySchemaName));
      this._models.set(entitySchemaName, model);
    }
    return model;
  }

  /**
   * Returns `null` on success or the error message.
   */
  private async _updateRecords(model: Model, dto: JsonObject, recordIds: string[]): Promise<string | null> {
    const filter = new FilterGroup();
    filter.addSchemaColumnInFilterWithParameters(ComparisonType.Equal, 'Id', recordIds);
    try {
      const response = await model.update(dto, [{ type: ModelParameterType.Filter, value: filter }]);
      return response?.success === false ? response.errorInfo || 'Unknown error' : null;
    } catch (error) {
      return getErrorMessage(error);
    }
  }

  private _registerFailure(result: BulkChangeResult, recordId: string, message: string): void {
    result.failed++;
    if (result.errors.length < MAX_ERRORS_TO_KEEP) {
      result.errors.push(`${recordId}: ${message}`);
    }
  }
}

/**
 * Converts the editor value to the value the data source expects: lookups are sent as their Id.
 */
export function toModelValue(value: BulkChangeValue): string | number | boolean | Date | null {
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    return (value as LookupValue).value;
  }
  return value;
}

export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  const candidate = error as { message?: string; errorInfo?: { message?: string }; error?: { message?: string } };
  return candidate?.errorInfo?.message || candidate?.error?.message || candidate?.message || String(error);
}

interface GridProfileColumn {
  viewMetadata?: { code?: string; caption?: string; dataValueType?: number; referenceSchemaName?: string };
  modelMetadata?: { path?: string; name?: string };
}

/**
 * Extracts the list columns from the `SysProfileData.ObjectData` JSON of a data grid.
 * Technical columns without view metadata (for example the primary column) are skipped.
 */
export function parseGridProfileColumns(objectData: string): GridColumnConfig[] | null {
  let profile: { columns?: GridProfileColumn[] };
  try {
    profile = JSON.parse(objectData);
  } catch {
    return null;
  }
  if (!Array.isArray(profile?.columns)) {
    return null;
  }
  return profile.columns
    .filter((column) => column.viewMetadata?.code)
    .map((column) => ({
      code: column.viewMetadata!.code!,
      path: column.modelMetadata?.path ?? column.modelMetadata?.name,
      caption: column.viewMetadata!.caption,
      dataValueType: column.viewMetadata!.dataValueType,
      referenceSchemaName: column.viewMetadata!.referenceSchemaName,
    }));
}