import { DataValueType, LookupValue } from '@creatio-devkit/common';

/**
 * Column of the linked list (data grid) as the properties panel copies it from the grid configuration.
 * `path` is the entity column path, `code` is the collection item attribute name (for example `PDS_Owner`).
 */
export interface GridColumnConfig {
  code: string;
  path?: string;
  caption?: string;
  dataValueType?: number;
  referenceSchemaName?: string;
}

/**
 * Kind of value editor shown for a column.
 */
export enum ValueEditorKind {
  Text = 'text',
  LongText = 'long-text',
  Integer = 'integer',
  Decimal = 'decimal',
  Boolean = 'boolean',
  Date = 'date',
  DateTime = 'datetime',
  Time = 'time',
  Lookup = 'lookup',
}

/**
 * Column that can be changed by the bulk change.
 */
export interface EditableColumn {
  /** Entity column name, for example `Owner`. */
  name: string;
  caption: string;
  dataValueType: DataValueType;
  editor: ValueEditorKind;
  isRequired: boolean;
  referenceSchemaName?: string;
}

/**
 * Selection state of a Freedom UI data grid (`<GridName>_SelectionState` attribute).
 */
export type GridSelectionState =
  | { type: 'specific'; selected: string[] }
  | { type: 'all'; unselected: string[] };

/**
 * Value chosen by the user for a column. `null` means "clear value".
 */
export type BulkChangeValue = string | number | boolean | Date | LookupValue | null;

export interface BulkChangeProgress {
  total: number;
  processed: number;
  updated: number;
  failed: number;
}

export interface BulkChangeResult extends BulkChangeProgress {
  stopped: boolean;
  errors: string[];
}

/**
 * Payload of the `bulkChangeCompleted` output.
 */
export interface BulkChangeCompletedEvent {
  entitySchemaName: string;
  columnName: string;
  updated: number;
  failed: number;
  stopped: boolean;
  /** Text of the result notification the page shows. */
  message: string;
}

export const DEFAULT_BATCH_SIZE = 200;
export const DEFAULT_MAX_RECORDS = 20000;
export const ID_PAGE_SIZE = 5000;
export const BULK_CHANGE_OPERATION_CODE = 'PfkCanBulkChange';
