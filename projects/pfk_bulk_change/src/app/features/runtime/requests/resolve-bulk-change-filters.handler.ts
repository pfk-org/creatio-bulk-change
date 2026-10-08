import { Injectable } from '@angular/core';
import { BaseRequest, BaseRequestHandler, CrtRequestHandler, FilterGroup, JsonObject } from '@creatio-devkit/common';

import { RESOLVE_FILTERS_HANDLER_TYPE, RESOLVE_FILTERS_REQUEST } from '../runtime-feature.ids';

export type SelectionFilters = FilterGroup | JsonObject;

/**
 * Request the bulk change component dispatches (through its `filtersRequested` output) to get the
 * selection filters of the linked list at the moment of the run.
 *
 * Request params are evaluated when the request is dispatched, the same way as for the list bulk
 * actions, so `filters` (`$Items | crt.ToCollectionFilters : 'Items' : $DataTable_SelectionState`)
 * always reflects the current selection and list filters. A property binding with the same
 * expression is NOT used: it is re-evaluated only when `$Items` changes and goes stale when the
 * selection changes.
 */
export interface ResolveBulkChangeFiltersRequest extends BaseRequest {
  filters?: SelectionFilters | null;
  callback?: (filters: SelectionFilters | null) => void;
}

@Injectable()
@CrtRequestHandler({
  type: RESOLVE_FILTERS_HANDLER_TYPE,
  requestType: RESOLVE_FILTERS_REQUEST,
})
export class ResolveBulkChangeFiltersHandler extends BaseRequestHandler<ResolveBulkChangeFiltersRequest> {
  public async handle(request: ResolveBulkChangeFiltersRequest): Promise<unknown> {
    if (typeof request.callback === 'function') {
      request.callback(request.filters ?? null);
    }
    return this.next?.handle(request);
  }
}
