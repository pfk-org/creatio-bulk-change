import type { RemoteDesignerDefinitionsLoadContext, RemoteFeatureDefinition } from '@creatio-devkit/common';
import {
  BULK_CHANGE_TYPE,
  COMPLETED_HANDLER_TYPE,
  COMPLETED_REQUEST,
  RESOLVE_FILTERS_HANDLER_TYPE,
  RESOLVE_FILTERS_REQUEST,
  RUNTIME_FEATURE_ID,
} from './runtime-feature.ids';

/**
 * Root definition for the runtime feature.
 *
 * Publishes the bulk change view element and the request handler that returns the current list
 * selection filters, and provides the entry points used to load designer metadata and to activate the feature.
 */
export const runtimeFeatureDefinition = {
  id: RUNTIME_FEATURE_ID,
  discovery: {
    viewElements: [{ type: BULK_CHANGE_TYPE }],
    requestHandlers: [
      { type: RESOLVE_FILTERS_HANDLER_TYPE, requestType: RESOLVE_FILTERS_REQUEST },
      { type: COMPLETED_HANDLER_TYPE, requestType: COMPLETED_REQUEST },
    ],
  },
  loadDesignerDefinitions: (context: RemoteDesignerDefinitionsLoadContext) =>
    import('./runtime.designer-definitions').then((m) => m.loadRuntimeDesignerDefinitions(context)),
  activate: () =>
    import('./runtime.feature-activation').then((m) => m.activateRuntimeFeature()),
} satisfies RemoteFeatureDefinition;
