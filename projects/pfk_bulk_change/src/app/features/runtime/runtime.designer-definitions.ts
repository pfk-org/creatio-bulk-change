import type {
  RemoteDesignerDefinitionsLoadContext,
  RemoteFeatureDesignerDefinitions,
} from '@creatio-devkit/common';

import { BULK_CHANGE_PANEL_TYPE } from '../design/design-feature.ids';
import { DEFAULT_BATCH_SIZE, DEFAULT_MAX_RECORDS } from '../../shared/bulk-change.models';
import { getStrings, getUserCultureName } from '../../shared/i18n';
import { BULK_CHANGE_ICON } from './icons/bulk-change.icon';
import { BULK_CHANGE_TYPE } from './runtime-feature.ids';

/**
 * Toolbox metadata of the bulk change component. The list it works with is linked in the properties panel.
 */
export async function loadRuntimeDesignerDefinitions(
  _context: RemoteDesignerDefinitionsLoadContext,
): Promise<RemoteFeatureDesignerDefinitions> {
  const strings = getStrings(await getUserCultureName());
  return {
    viewElements: [
      {
        type: BULK_CHANGE_TYPE,
        toolbarConfig: {
          caption: strings.buttonCaption,
          icon: BULK_CHANGE_ICON,
        },
        defaultPropertyValues: {
          visible: true,
          batchSize: DEFAULT_BATCH_SIZE,
          maxRecords: DEFAULT_MAX_RECORDS,
        },
        propertiesPanel: BULK_CHANGE_PANEL_TYPE,
      },
    ],
  };
}
