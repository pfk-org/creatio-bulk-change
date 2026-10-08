import type { RemoteFeatureDefinition } from '@creatio-devkit/common';
import { BULK_CHANGE_PANEL_TYPE, DESIGN_FEATURE_ID } from './design-feature.ids';

/**
 * Root definition for the design-time feature: the properties panel of the bulk change component.
 */
export const designFeatureDefinition = {
  id: DESIGN_FEATURE_ID,
  discovery: {
    viewElements: [{ type: BULK_CHANGE_PANEL_TYPE }],
  },
  activate: () =>
    import('./design.feature-activation').then((m) => m.activateDesignFeature()),
} satisfies RemoteFeatureDefinition;
