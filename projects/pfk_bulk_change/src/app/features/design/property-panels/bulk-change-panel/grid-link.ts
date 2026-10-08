import { JsonData } from '@creatio-devkit/common';
import {
  DataSourceType,
  CollectionViewModelAttributeEditor,
  SchemaEditor,
  ViewModelAttributeEditor,
  ViewModelAttributeType,
  ViewNodeEditor,
  ViewNodePropertyValueType,
} from '@creatio/interface-designer';

import { GridColumnConfig } from '../../../../shared/bulk-change.models';
import { COMPLETED_REQUEST } from '../../../runtime/runtime-feature.ids';

export const DEFAULT_GRID_NAME = 'DataTable';

/**
 * Everything the bulk change component needs to know about the list it is linked to.
 */
export interface GridLink {
  gridName: string;
  itemsAttributeName: string;
  selectionStateAttributeName: string;
  dataSourceName: string;
  entitySchemaName: string;
  columns: GridColumnConfig[];
}

export type GridLinkResult = { ok: true; link: GridLink } | { ok: false; error: 'panelGridNotFound' | 'panelGridNotList' };

interface RawGridColumn {
  code?: string;
  path?: string;
  caption?: string;
  dataValueType?: number;
  referenceSchemaName?: string;
}

/**
 * Reads the list (data grid) configuration through the public Interface Designer API:
 * the collection attribute it shows, its data source and entity, its selection attribute and columns.
 */
export async function resolveGridLink(schemaEditor: SchemaEditor, gridName: string): Promise<GridLinkResult> {
  const grid = await schemaEditor.viewEditor.getNodeEditorByName(gridName);
  if (!grid) {
    return { ok: false, error: 'panelGridNotFound' };
  }
  const items = await grid.getPropertyValue('items');
  if (items?.type !== ViewNodePropertyValueType.AttributeBinding) {
    return { ok: false, error: 'panelGridNotList' };
  }
  const collection = await schemaEditor.viewModelEditor.getAttributeEditor(items.attributePath);
  if (collection?.attributeType !== ViewModelAttributeType.ModelBindingCollection) {
    return { ok: false, error: 'panelGridNotList' };
  }
  const { dataSourceName } = await collection.getModelBinding();
  const dataSource = await schemaEditor.modelEditor.getDataSourceEditor(dataSourceName);
  if (dataSource?.dataSourceType !== DataSourceType.EntityDataSource) {
    return { ok: false, error: 'panelGridNotList' };
  }
  const selectionState = await grid.getPropertyValue('selectionState');
  const selectionStateAttributeName =
    selectionState?.type === ViewNodePropertyValueType.AttributeBinding
      ? selectionState.attributePath
      : `${gridName}_SelectionState`;

  const columns: GridColumnConfig[] = [];
  for (const rawColumn of await readRawColumns(grid)) {
    if (!rawColumn.code) {
      continue;
    }
    let path = rawColumn.path;
    if (!path) {
      const itemAttribute = await collection.getAttributeEditor(rawColumn.code);
      if (itemAttribute?.attributeType === ViewModelAttributeType.ModelBindingValue) {
        path = (await itemAttribute.getModelBinding()).dataSourceAttributePath;
      }
    }
    columns.push({
      code: rawColumn.code,
      path,
      caption: rawColumn.caption,
      dataValueType: rawColumn.dataValueType,
      referenceSchemaName: rawColumn.referenceSchemaName,
    });
  }

  return {
    ok: true,
    link: {
      gridName,
      itemsAttributeName: items.attributePath,
      selectionStateAttributeName,
      dataSourceName,
      entitySchemaName: dataSource.entitySchemaName,
      columns,
    },
  };
}

/**
 * Suffixes of the page attributes the platform creates for a list page data grid (`<GridName>_<Suffix>`).
 */
const GRID_ATTRIBUTE_SUFFIX = /^(.+)_(NoItems|NoFilteredItems|SelectionState|ActiveRow)$/;
const DATA_SOURCE_SUFFIX = /^(.+)DS$/;

/**
 * Finds the lists (data grids bound to entity collections) on the page.
 *
 * The public designer API cannot enumerate view nodes, so list codes are guessed from the page
 * attributes and then verified with {@link resolveGridLink}:
 * - `<GridName>_SelectionState` and similar attributes (list pages);
 * - collection attributes and their data sources: a form page list (detail) is usually named
 *   after its collection (`AddressList` shows `$AddressList` from `AddressListDS`), and the
 *   platform creates no `_SelectionState` attribute for it.
 */
export async function discoverGridLinks(schemaEditor: SchemaEditor, extraGridNames: string[] = []): Promise<GridLink[]> {
  const candidates = new Set<string>([DEFAULT_GRID_NAME, ...extraGridNames.filter(Boolean)]);
  let attributes: [string, ViewModelAttributeEditor][] = [];
  try {
    attributes = [...(await schemaEditor.viewModelEditor.getAllAttributeEditors()).entries()];
  } catch (error) {
    console.warn('[PfkBulkChange] Page attributes cannot be read; only known list codes are checked', error);
  }
  for (const [attributeName, attribute] of attributes) {
    if (attributeName.includes('.')) {
      continue;
    }
    const match = GRID_ATTRIBUTE_SUFFIX.exec(attributeName);
    if (match) {
      candidates.add(match[1]);
    }
    if (attribute?.attributeType === ViewModelAttributeType.ModelBindingCollection) {
      candidates.add(attributeName);
      const dataSourceName = await getCollectionDataSourceName(attribute);
      const dataSourceMatch = dataSourceName ? DATA_SOURCE_SUFFIX.exec(dataSourceName) : null;
      if (dataSourceMatch) {
        candidates.add(dataSourceMatch[1]);
      }
    }
  }
  const links: GridLink[] = [];
  for (const gridName of candidates) {
    try {
      const result = await resolveGridLink(schemaEditor, gridName);
      if (result.ok) {
        links.push(result.link);
      }
    } catch (error) {
      console.warn(`[PfkBulkChange] "${gridName}" is skipped: it cannot be read as a list`, error);
    }
  }
  return links;
}

/**
 * Request the page runs after a bulk change: shows the result notification and reloads the list
 * data source (see `BulkChangeCompletedHandler`).
 */
export function buildCompletedRequest(link: GridLink): { request: string; params: Record<string, JsonData> } {
  return {
    request: COMPLETED_REQUEST,
    params: {
      dataSourceName: link.dataSourceName,
      message: '@event.detail.message',
    },
  };
}

async function getCollectionDataSourceName(attribute: CollectionViewModelAttributeEditor): Promise<string | undefined> {
  try {
    return (await attribute.getModelBinding())?.dataSourceName;
  } catch {
    return undefined;
  }
}

async function readRawColumns(grid: ViewNodeEditor): Promise<RawGridColumn[]> {
  const columns = await grid.getPropertyValue('columns');
  if (columns?.type !== ViewNodePropertyValueType.Constant || !Array.isArray(columns.value)) {
    return [];
  }
  return columns.value as RawGridColumn[];
}

/**
 * Binding expression that turns the list selection into filters. For "select all" it contains the
 * current list filters (search, folders, quick filters) and excludes unselected records.
 */
export function buildFiltersExpression(link: GridLink): string {
  return `$${link.itemsAttributeName} | crt.ToCollectionFilters : '${link.itemsAttributeName}' : $${link.selectionStateAttributeName}`;
}
