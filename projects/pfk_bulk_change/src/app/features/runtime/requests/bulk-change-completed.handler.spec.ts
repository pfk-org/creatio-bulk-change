import { HandlerChainService } from '@creatio-devkit/common';

import { BulkChangeCompletedHandler } from './bulk-change-completed.handler';

describe('BulkChangeCompletedHandler', () => {
  afterEach(() => jest.restoreAllMocks());

  it('shows the notification and reloads the list data source with the page context', async () => {
    const process = jest.spyOn(HandlerChainService.instance, 'process').mockResolvedValue(undefined);
    const $context = { page: true };
    await new BulkChangeCompletedHandler().handle({
      type: 'pfk.BulkChangeCompletedRequest',
      $context,
      scopes: ['Accounts_ListPage'],
      dataSourceName: 'PDS',
      message: 'Bulk change completed: 5 records updated',
    });
    expect(process).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'crt.NotificationRequest', message: 'Bulk change completed: 5 records updated', $context }),
    );
    expect(process).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'crt.LoadDataRequest', config: { loadType: 'reload' }, dataSourceName: 'PDS', $context }),
    );
  });

  it('still reloads the list when the notification fails', async () => {
    const process = jest
      .spyOn(HandlerChainService.instance, 'process')
      .mockImplementation(async (request) => {
        if (request.type === 'crt.NotificationRequest') {
          throw new Error('No toast');
        }
        return undefined;
      });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await new BulkChangeCompletedHandler().handle({ type: 'x', $context: {}, dataSourceName: 'PDS', message: 'Done' });
    expect(process).toHaveBeenCalledWith(expect.objectContaining({ type: 'crt.LoadDataRequest' }));
  });
});