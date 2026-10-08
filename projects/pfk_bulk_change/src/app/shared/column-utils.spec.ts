import { DataSchema, DataSchemaAttributeType, DataValueType } from '@creatio-devkit/common';

import { ValueEditorKind } from './bulk-change.models';
import { getEditableColumns, getEditorKind, getGridColumnPath } from './column-utils';

function attribute(name: string, dataValueType: DataValueType, extra: Record<string, unknown> = {}) {
  return {
    name,
    caption: `${name} caption`,
    path: name,
    dataValueType,
    attributeType: DataSchemaAttributeType.OwnAttribute,
    isRequired: false,
    ...extra,
  };
}

const schema = {
  name: 'Contact',
  primaryAttributeName: 'Id',
  primaryDisplayAttributeName: 'Name',
  attributes: [
    attribute('Id', DataValueType.Guid),
    attribute('Name', DataValueType.MEDIUM_TEXT, { isRequired: true }),
    attribute('Owner', DataValueType.Lookup, { referenceSchemaName: 'Contact' }),
    attribute('BirthDate', DataValueType.Date),
    attribute('Photo', DataValueType.Image),
    attribute('CreatedOn', DataValueType.DateTime),
    attribute('BrokenLookup', DataValueType.Lookup),
  ],
} as unknown as DataSchema;

describe('column-utils', () => {
  describe('getEditorKind', () => {
    it('maps supported data value types to editors', () => {
      expect(getEditorKind(DataValueType.SHORT_TEXT)).toBe(ValueEditorKind.Text);
      expect(getEditorKind(DataValueType.MAXSIZE_TEXT)).toBe(ValueEditorKind.LongText);
      expect(getEditorKind(DataValueType.Integer)).toBe(ValueEditorKind.Integer);
      expect(getEditorKind(DataValueType.Money)).toBe(ValueEditorKind.Decimal);
      expect(getEditorKind(DataValueType.Boolean)).toBe(ValueEditorKind.Boolean);
      expect(getEditorKind(DataValueType.Date)).toBe(ValueEditorKind.Date);
      expect(getEditorKind(DataValueType.DateTime)).toBe(ValueEditorKind.DateTime);
      expect(getEditorKind(DataValueType.Time)).toBe(ValueEditorKind.Time);
      expect(getEditorKind(DataValueType.Lookup)).toBe(ValueEditorKind.Lookup);
    });

    it('returns null for unsupported types', () => {
      expect(getEditorKind(DataValueType.Image)).toBeNull();
      expect(getEditorKind(DataValueType.RICH_TEXT)).toBeNull();
      expect(getEditorKind(undefined)).toBeNull();
    });
  });

  describe('getGridColumnPath', () => {
    it('prefers the explicit path', () => {
      expect(getGridColumnPath({ code: 'PDS_Owner', path: 'Owner' }, 'PDS')).toBe('Owner');
    });

    it('strips the data source prefix from the code', () => {
      expect(getGridColumnPath({ code: 'PDS_Name' }, 'PDS')).toBe('Name');
    });

    it('returns null when the path cannot be resolved', () => {
      expect(getGridColumnPath({ code: 'Name' }, 'PDS')).toBeNull();
    });
  });

  describe('getEditableColumns', () => {
    it('keeps only own, writable, supported grid columns in grid order', () => {
      const columns = getEditableColumns(
        schema,
        [
          { code: 'PDS_Owner', path: 'Owner' },
          { code: 'PDS_Name' },
          { code: 'PDS_Id', path: 'Id' },
          { code: 'PDS_Photo', path: 'Photo' },
          { code: 'PDS_CreatedOn', path: 'CreatedOn' },
          { code: 'PDS_AccountOwner', path: 'Account.Owner' },
          { code: 'PDS_BrokenLookup', path: 'BrokenLookup' },
          { code: 'PDS_BirthDate', path: 'BirthDate' },
          { code: 'PDS_Owner2', path: 'Owner' },
        ],
        'PDS',
      );
      expect(columns.map((column) => column.name)).toEqual(['Owner', 'Name', 'BirthDate']);
      expect(columns[0]).toEqual(
        expect.objectContaining({ editor: ValueEditorKind.Lookup, referenceSchemaName: 'Contact', isRequired: false }),
      );
      expect(columns[1].isRequired).toBe(true);
    });

    it('returns an empty list for empty input', () => {
      expect(getEditableColumns(schema, [], 'PDS')).toEqual([]);
    });
  });
});
