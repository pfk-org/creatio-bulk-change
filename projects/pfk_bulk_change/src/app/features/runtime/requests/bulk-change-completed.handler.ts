import { Injectable } from '@angular/core';
import { BaseRequest, BaseRequestHandler, CrtRequestHandler, HandlerChainService } from '@creatio-devkit/common';

import { COMPLETED_HANDLER_TYPE, COMPLETED_REQUEST } from '../runtime-feature.ids';

const NOTIFICATION_DURATION_MS = 5000;

/**
 * Request the page dispatches when the bulk change component emits `bulkChangeCompleted`.
 * The properties panel binds it with `dataSourceName` of the list and `message: @event.detail.message`.
 */
export interface BulkChangeCompletedRequest extends BaseRequest {
  dataSourceName?: string;
  message?: string;
}

/**
 * Shows the result notification and reloads the list data source at the same time. Both platform
 * requests need the page context, which only a page request handler has.
 */
@Injectable()
@CrtRequestHandler({
  type: COMPLETED_HANDLER_TYPE,
  requestType: COMPLETED_REQUEST,
})
export class BulkChangeCompletedHandler extends BaseRequestHandler<BulkChangeCompletedRequest> {
  public async handle(request: BulkChangeCompletedRequest): Promise<unknown> {
    const chain = HandlerChainService.instance;
    const context = { $context: request.$context, scopes: request.scopes };
    const pending: Promise<unknown>[] = [];
    if (request.message) {
      pending.push(
        chain.process({ type: 'crt.NotificationRequest', message: request.message, duration: NOTIFICATION_DURATION_MS, ...context } as BaseRequest),
      );
    }
    if (request.dataSourceName) {
      pending.push(
        chain.process({ type: 'crt.LoadDataRequest', config: { loadType: 'reload' }, dataSourceName: request.dataSourceName, ...context } as BaseRequest),
      );
    }
    const results = await Promise.allSettled(pending);
    results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .forEach((result) => console.error('[PfkBulkChange] Completion step failed', result.reason));
    return this.next?.handle(request);
  }
}
