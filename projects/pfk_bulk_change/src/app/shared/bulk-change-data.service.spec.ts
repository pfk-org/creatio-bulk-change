import { DataValueType, Model, ModelParameterType } from '@creatio-devkit/common';

import { BulkChangeDataService, parseGridProfileColumns, toModelValue } from './bulk-change-data.service';
import { EditableColumn, ID_PAGE_SIZE, ValueEditorKind } from './bulk-change.models';

const ownerColumn: EditableColumn = {
  name: 'Owner',
  caption: 'Owner',
  dataValueType: DataValueType.Lookup,
  editor: ValueEditorKind.Lookup,
  isRequired: false,
  referenceSchemaName: 'Contact',
};

function createModelMock() {
  return {
    getSchema: jest.fn().mockResolvedValue({ name: 'Contact', primaryAttributeName: 'Id', primaryDisplayAttributeName: 'Name', attributes: [] }),
    load: jest.fn(),
    update: jest.fn().mockResolvedValue({ success: true, rowsAffected: 1 }),
  };
}

function idsOf(update: jest.Mock, callIndex: number): string[] {
  const filter = update.mock.calls[callIndex][1][0].value;
  return JSON.stringify(filter.toJson()).match(/id-\d+/g) ?? [];
}

describe('BulkChangeDataService', () => {
  let service: BulkChangeDataService;
  let model: ReturnType<typeof createModelMock>;

  beforeEach(() => {
    model = createModelMock();
    jest.spyOn(Model, 'create').mockResolvedValue(model as unknown as Model);
    service = new BulkChangeDataService();
  });

  afterEach(() => jest.restoreAllMocks());

  describe('resolveRecordIds', () => {
    it('uses exactly the selected records and never the list filters for a specific selection', async () => {
      // Regression: 3 selected records must never become "all records of the list".
      const listFilters = { items: {} };
      const ids = await service.resolveRecordIds(
        'Contact',
        { type: 'specific', selected: ['a', 'b', 'c', 'a'] },
        listFilters,
        10,
      );
      expect(ids).toEqual(['a', 'b', 'c']);
      expect(model.load).not.toHaveBeenCalled();
    });

    it('resolves nothing for "select all" without list filters', async () => {
      expect(await service.resolveRecordIds('Contact', { type: 'all', unselected: [] }, null, 10)).toEqual([]);
      expect(await service.resolveRecordIds('Contact', null, { items: {} }, 10)).toEqual([]);
      expect(model.load).not.toHaveBeenCalled();
    });

    it('excludes unselected records for "select all"', async () => {
      model.load.mockResolvedValueOnce([{ Id: 'x' }]);
      await service.resolveRecordIds('Contact', { type: 'all', unselected: ['u-1', 'u-2'] }, { items: {} }, 10);
      const parameters = model.load.mock.calls[0][0].parameters;
      expect(parameters).toHaveLength(2);
      const exclusion = JSON.stringify(parameters[1].value.toJson());
      expect(exclusion).toContain('u-1');
      expect(exclusion).toContain('u-2');
      expect(exclusion).toContain('"comparisonType":4');
    });

    it('pages through the filtered records sorted by Id', async () => {
      const page = Array.from({ length: ID_PAGE_SIZE }, (_, index) => ({ Id: `p1-${index}` }));
      model.load.mockResolvedValueOnce(page).mockResolvedValueOnce([{ Id: 'last' }]);
      const filters = { items: {} };
      const ids = await service.resolveRecordIds('Contact', { type: 'all', unselected: [] }, filters, 100000);
      expect(ids.length).toBe(ID_PAGE_SIZE + 1);
      expect(model.load).toHaveBeenCalledTimes(2);
      const secondCall = model.load.mock.calls[1][0];
      expect(secondCall.options.pagingConfig).toEqual({ rowsOffset: ID_PAGE_SIZE, rowCount: ID_PAGE_SIZE });
      expect(secondCall.options.sortingConfig.columns[0]).toEqual({ columnName: 'Id', direction: 'asc' });
      expect(secondCall.parameters[0]).toEqual({ type: ModelParameterType.Filter, value: filters });
    });

    it('stops reading once the limit is exceeded', async () => {
      const page = Array.from({ length: ID_PAGE_SIZE }, (_, index) => ({ Id: `p-${index}` }));
      model.load.mockResolvedValue(page);
      const ids = await service.resolveRecordIds('Contact', { type: 'all', unselected: [] }, { items: {} }, 10);
      expect(ids.length).toBeGreaterThan(10);
      expect(model.load).toHaveBeenCalledTimes(1);
    });
  });

  describe('run', () => {
    it('updates records in batches by Id and reports progress', async () => {
      const onProgress = jest.fn();
      const result = await service.run({
        entitySchemaName: 'Contact',
        column: ownerColumn,
        value: { value: 'owner-id', displayValue: 'Supervisor' },
        recordIds: ['id-1', 'id-2', 'id-3'],
        batchSize: 2,
        onProgress,
      });
      expect(model.update).toHaveBeenCalledTimes(2);
      expect(model.update.mock.calls[0][0]).toEqual({ Owner: 'owner-id' });
      expect(idsOf(model.update, 0)).toEqual(['id-1', 'id-2']);
      expect(idsOf(model.update, 1)).toEqual(['id-3']);
      expect(result).toEqual(expect.objectContaining({ total: 3, processed: 3, updated: 3, failed: 0, stopped: false }));
      expect(onProgress).toHaveBeenCalledTimes(2);
    });

    it('retries a failed batch record by record and reports failed records', async () => {
      model.update
        .mockRejectedValueOnce(new Error('Batch rolled back'))
        .mockResolvedValueOnce({ success: true, rowsAffected: 1 })
        .mockResolvedValueOnce({ success: false, rowsAffected: -1, errorInfo: 'No edit rights' });
      const result = await service.run({
        entitySchemaName: 'Contact',
        column: ownerColumn,
        value: null,
        recordIds: ['id-1', 'id-2'],
        batchSize: 10,
      });
      expect(model.update).toHaveBeenCalledTimes(3);
      expect(model.update.mock.calls[1][0]).toEqual({ Owner: null });
      expect(result.updated).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toEqual(['id-2: No edit rights']);
    });

    it('stops between batches when cancelled', async () => {
      let cancelled = false;
      model.update.mockImplementation(async () => {
        cancelled = true;
        return { success: true, rowsAffected: 1 };
      });
      const result = await service.run({
        entitySchemaName: 'Contact',
        column: ownerColumn,
        value: null,
        recordIds: ['id-1', 'id-2', 'id-3'],
        batchSize: 1,
        isCancelled: () => cancelled,
      });
      expect(model.update).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expect.objectContaining({ processed: 1, updated: 1, stopped: true }));
    });
  });

  describe('toModelValue', () => {
    it('sends lookups as their Id and keeps other values', () => {
      const date = new Date(2026, 0, 1);
      expect(toModelValue({ value: 'id', displayValue: 'Name' })).toBe('id');
      expect(toModelValue(date)).toBe(date);
      expect(toModelValue(5)).toBe(5);
      expect(toModelValue(null)).toBeNull();
    });
  });
});

describe('parseGridProfileColumns', () => {
  it('reads list columns from the grid profile and skips technical columns', () => {
    const objectData = JSON.stringify({
      columns: [
        { viewModelMetadata: { attributeName: 'PDS_Id' }, modelMetadata: { name: 'Id', path: 'Id' } },
        { viewMetadata: { code: 'PDS_Name', caption: 'Name', dataValueType: 28 }, modelMetadata: { path: 'Name' } },
        { viewMetadata: { code: 'PDS_AnnualRevenue', dataValueType: 10 }, modelMetadata: { name: 'AnnualRevenue', path: 'AnnualRevenue' } },
      ],
    });
    expect(parseGridProfileColumns(objectData)).toEqual([
      { code: 'PDS_Name', path: 'Name', caption: 'Name', dataValueType: 28, referenceSchemaName: undefined },
      { code: 'PDS_AnnualRevenue', path: 'AnnualRevenue', caption: undefined, dataValueType: 10, referenceSchemaName: undefined },
    ]);
  });

  it('returns null for invalid profiles', () => {
    expect(parseGridProfileColumns('not json')).toBeNull();
    expect(parseGridProfileColumns('{"rows":{}}')).toBeNull();
  });
});