import { DataSchema, DataSchemaAttribute, DataSchemaAttributeType, DataValueType } from '@creatio-devkit/common';

import { EditableColumn, GridColumnConfig, ValueEditorKind } from './bulk-change.models';

/**
 * Columns that are maintained by the platform and must never be changed in bulk.
 */
const SYSTEM_COLUMN_NAMES = new Set([
  'Id',
  'CreatedOn',
  'CreatedBy',
  'ModifiedOn',
  'ModifiedBy',
  'ProcessListeners',
]);

const TEXT_TYPES = new Set<number>([
  DataValueType.Text,
  DataValueType.SHORT_TEXT,
  DataValueType.MEDIUM_TEXT,
  DataValueType.LONG_TEXT,
  DataValueType.PHONE_TEXT,
  DataValueType.WEB_TEXT,
  DataValueType.EMAIL_TEXT,
]);

const DECIMAL_TYPES = new Set<number>([
  DataValueType.Float,
  DataValueType.Money,
  DataValueType.FLOAT0,
  DataValueType.FLOAT1,
  DataValueType.FLOAT2,
  DataValueType.FLOAT3,
  DataValueType.FLOAT4,
  DataValueType.FLOAT8,
  DataValueType.MONEY0,
  DataValueType.MONEY1,
  DataValueType.MONEY3,
]);

/**
 * Returns the value editor for a data value type, or `null` when bulk change does not support the type.
 */
export function getEditorKind(dataValueType: number | undefined): ValueEditorKind | null {
  if (dataValueType === undefined || dataValueType === null) {
    return null;
  }
  if (TEXT_TYPES.has(dataValueType)) {
    return ValueEditorKind.Text;
  }
  if (dataValueType === DataValueType.MAXSIZE_TEXT) {
    return ValueEditorKind.LongText;
  }
  if (DECIMAL_TYPES.has(dataValueType)) {
    return ValueEditorKind.Decimal;
  }
  switch (dataValueType) {
    case DataValueType.Integer:
      return ValueEditorKind.Integer;
    case DataValueType.Boolean:
      return ValueEditorKind.Boolean;
    case DataValueType.Date:
      return ValueEditorKind.Date;
    case DataValueType.DateTime:
      return ValueEditorKind.DateTime;
    case DataValueType.Time:
      return ValueEditorKind.Time;
    case DataValueType.Lookup:
      return ValueEditorKind.Lookup;
    default:
      return null;
  }
}

/**
 * Entity column path of a grid column: its `path`, or the attribute code without the data source prefix.
 */
export function getGridColumnPath(column: GridColumnConfig, dataSourceName?: string): string | null {
  if (column.path) {
    return column.path;
  }
  const prefix = dataSourceName ? `${dataSourceName}_` : '';
  if (prefix && column.code?.startsWith(prefix)) {
    return column.code.substring(prefix.length);
  }
  return null;
}

function isAttributeEditable(attribute: DataSchemaAttribute, primaryAttributeName?: string): boolean {
  if (attribute.name === primaryAttributeName || SYSTEM_COLUMN_NAMES.has(attribute.name)) {
    return false;
  }
  if (attribute.attributeType && attribute.attributeType !== DataSchemaAttributeType.OwnAttribute) {
    return false;
  }
  if (attribute.dataValueType === DataValueType.Lookup && !attribute.referenceSchemaName) {
    return false;
  }
  return getEditorKind(attribute.dataValueType) !== null;
}

/**
 * Builds the list of columns the user can change: grid columns that are own, writable columns of the entity.
 * Columns referencing other objects (for example `Account.Owner`) are skipped because they belong to another entity.
 */
export function getEditableColumns(
  schema: DataSchema,
  gridColumns: GridColumnConfig[],
  dataSourceName?: string,
): EditableColumn[] {
  const attributesByName = new Map(schema.attributes.map((attribute) => [attribute.name, attribute]));
  const result: EditableColumn[] = [];
  const added = new Set<string>();
  for (const gridColumn of gridColumns ?? []) {
    const path = getGridColumnPath(gridColumn, dataSourceName);
    if (!path || path.includes('.') || added.has(path)) {
      continue;
    }
    const attribute = attributesByName.get(path);
    if (!attribute || !isAttributeEditable(attribute, schema.primaryAttributeName)) {
      continue;
    }
    added.add(path);
    result.push({
      name: attribute.name,
      caption: attribute.caption || gridColumn.caption || attribute.name,
      dataValueType: attribute.dataValueType,
      editor: getEditorKind(attribute.dataValueType) as ValueEditorKind,
      isRequired: Boolean(attribute.isRequired),
      referenceSchemaName: attribute.referenceSchemaName,
    });
  }
  return result;
}
