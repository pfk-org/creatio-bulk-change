import {
  DataSourceType,
  SchemaEditor,
  ViewModelAttributeType,
  ViewNodePropertyValueType,
} from '@creatio/interface-designer';

import { buildFiltersExpression, buildCompletedRequest, discoverGridLinks, resolveGridLink } from './grid-link';

function createSchemaEditor(gridProperties: Record<string, unknown> | null): SchemaEditor {
  const grid = gridProperties && {
    nodeName: 'DataTable',
    getPropertyValue: jest.fn(async (name: string) => gridProperties[name]),
  };
  const collection = {
    attributeType: ViewModelAttributeType.ModelBindingCollection,
    getModelBinding: jest.fn().mockResolvedValue({ dataSourceName: 'PDS' }),
    getAttributeEditor: jest.fn(async (path: string) =>
      path === 'PDS_Name'
        ? {
            attributeType: ViewModelAttributeType.ModelBindingValue,
            getModelBinding: jest.fn().mockResolvedValue({ dataSourceName: 'PDS', dataSourceAttributePath: 'Name' }),
          }
        : undefined,
    ),
  };
  return {
    viewEditor: { getNodeEditorByName: jest.fn(async (name: string) => (name === 'DataTable' ? (grid ?? undefined) : undefined)) },
    viewModelEditor: {
      getAttributeEditor: jest.fn(async (path: string) => (path === 'Items' ? collection : undefined)),
      getAllAttributeEditors: jest.fn().mockResolvedValue(
        new Map<string, unknown>([
          ['Items', collection],
          ['DataTable_NoItems', {}],
          ['OtherGrid_SelectionState', {}],
          ['HeaderCaption', {}],
        ]),
      ),
    },
    modelEditor: {
      getDataSourceEditor: jest.fn().mockResolvedValue({
        dataSourceType: DataSourceType.EntityDataSource,
        entitySchemaName: 'Contact',
      }),
    },
  } as unknown as SchemaEditor;
}

const listGrid = {
  items: { type: ViewNodePropertyValueType.AttributeBinding, attributePath: 'Items' },
  selectionState: { type: ViewNodePropertyValueType.AttributeBinding, attributePath: 'DataTable_SelectionState' },
  columns: {
    type: ViewNodePropertyValueType.Constant,
    value: [
      { id: '1', code: 'PDS_Name', caption: 'Name', dataValueType: 1 },
      { id: '2', code: 'PDS_Owner', path: 'Owner', caption: 'Owner', dataValueType: 10, referenceSchemaName: 'Contact' },
    ],
  },
};

describe('resolveGridLink', () => {
  it('reads the collection, entity, selection attribute and columns of the list', async () => {
    const result = await resolveGridLink(createSchemaEditor(listGrid), 'DataTable');
    expect(result).toEqual({
      ok: true,
      link: {
        gridName: 'DataTable',
        itemsAttributeName: 'Items',
        selectionStateAttributeName: 'DataTable_SelectionState',
        dataSourceName: 'PDS',
        entitySchemaName: 'Contact',
        columns: [
          { code: 'PDS_Name', path: 'Name', caption: 'Name', dataValueType: 1, referenceSchemaName: undefined },
          { code: 'PDS_Owner', path: 'Owner', caption: 'Owner', dataValueType: 10, referenceSchemaName: 'Contact' },
        ],
      },
    });
  });

  it('reports a missing list', async () => {
    expect(await resolveGridLink(createSchemaEditor(null), 'Unknown')).toEqual({ ok: false, error: 'panelGridNotFound' });
  });

  it('reports an element that is not a list', async () => {
    const button = { caption: { type: ViewNodePropertyValueType.Constant, value: 'Save' } };
    expect(await resolveGridLink(createSchemaEditor(button), 'DataTable')).toEqual({ ok: false, error: 'panelGridNotList' });
  });

  it('falls back to the default selection attribute name', async () => {
    const result = await resolveGridLink(createSchemaEditor({ ...listGrid, selectionState: undefined }), 'DataTable');
    expect(result.ok && result.link.selectionStateAttributeName).toBe('DataTable_SelectionState');
  });
});

describe('buildFiltersExpression', () => {
  it('builds the platform selection-to-filters binding', () => {
    expect(
      buildFiltersExpression({
        gridName: 'DataTable',
        itemsAttributeName: 'Items',
        selectionStateAttributeName: 'DataTable_SelectionState',
        dataSourceName: 'PDS',
        entitySchemaName: 'Contact',
        columns: [],
      }),
    ).toBe("$Items | crt.ToCollectionFilters : 'Items' : $DataTable_SelectionState");
  });
});

describe('discoverGridLinks', () => {
  it('finds lists by the attributes the platform creates for data grids', async () => {
    const schemaEditor = createSchemaEditor(listGrid);
    const links = await discoverGridLinks(schemaEditor);
    expect(links.map((link) => link.gridName)).toEqual(['DataTable']);
    expect(schemaEditor.viewEditor.getNodeEditorByName).toHaveBeenCalledWith('OtherGrid');
  });
});

describe('buildCompletedRequest', () => {
  it('passes the list data source and the result message to the completion request', () => {
    const link = { gridName: 'DataTable', itemsAttributeName: 'Items', selectionStateAttributeName: 'DataTable_SelectionState', dataSourceName: 'PDS', entitySchemaName: 'Account', columns: [] };
    expect(buildCompletedRequest(link)).toEqual({
      request: 'pfk.BulkChangeCompletedRequest',
      params: { dataSourceName: 'PDS', message: '@event.detail.message' },
    });
  });
});
describe('discoverGridLinks on a form page', () => {
  it('finds a detail list named after its collection or data source, without a selection attribute', async () => {
    const addresses = {
      attributeType: ViewModelAttributeType.ModelBindingCollection,
      getModelBinding: jest.fn().mockResolvedValue({ dataSourceName: 'AddressListDS' }),
      getAttributeEditor: jest.fn().mockResolvedValue(undefined),
    };
    const contacts = {
      attributeType: ViewModelAttributeType.ModelBindingCollection,
      getModelBinding: jest.fn().mockResolvedValue({ dataSourceName: 'ContactsGridDS' }),
      getAttributeEditor: jest.fn().mockResolvedValue(undefined),
    };
    const grid = (items: string) => ({
      getPropertyValue: jest.fn(async (name: string) =>
        name === 'items' ? { type: ViewNodePropertyValueType.AttributeBinding, attributePath: items } : undefined,
      ),
    });
    const grids: Record<string, unknown> = { AddressList: grid('AddressList'), ContactsGrid: grid('ContactCollection') };
    const collections: Record<string, unknown> = { AddressList: addresses, ContactCollection: contacts };
    const schemaEditor = {
      viewEditor: { getNodeEditorByName: jest.fn(async (name: string) => grids[name]) },
      viewModelEditor: {
        getAttributeEditor: jest.fn(async (name: string) => collections[name]),
        getAllAttributeEditors: jest.fn().mockResolvedValue(
          new Map<string, unknown>([
            ['AddressList', addresses],
            ['ContactCollection', contacts],
            ['Name', { attributeType: ViewModelAttributeType.ModelBindingValue }],
          ]),
        ),
      },
      modelEditor: {
        getDataSourceEditor: jest.fn().mockResolvedValue({ dataSourceType: DataSourceType.EntityDataSource, entitySchemaName: 'AccountAddress' }),
      },
    } as unknown as SchemaEditor;

    const links = await discoverGridLinks(schemaEditor);

    expect(links.map((link) => link.gridName).sort()).toEqual(['AddressList', 'ContactsGrid']);
    expect(links.find((link) => link.gridName === 'AddressList')?.selectionStateAttributeName).toBe('AddressList_SelectionState');
  });
});
