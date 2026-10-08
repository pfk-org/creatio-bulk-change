import { Injector, ProviderToken, Type } from '@angular/core';
import { createCustomElement } from '@angular/elements';
import { bootstrapCrtModule } from '@creatio-devkit/common';

import { ensureFeatureModuleRef } from '../../remote-app-context';
import { DesignFeatureModule } from './design-feature.module';
import { BULK_CHANGE_PANEL_SELECTOR, REMOTE_NAME } from './design-feature.ids';
import { BulkChangePanelComponent } from './property-panels/bulk-change-panel/bulk-change-panel.component';

function defineCustomElement(selector: string, component: Type<unknown>, injector: Injector): void {
  if (!customElements.get(selector)) {
    customElements.define(selector, createCustomElement(component, { injector }));
  }
}

/**
 * Initializes the design feature module and registers the properties panel custom element.
 */
export async function activateDesignFeature(): Promise<void> {
  const moduleRef = await ensureFeatureModuleRef(DesignFeatureModule);
  const injector = moduleRef.injector;

  defineCustomElement(BULK_CHANGE_PANEL_SELECTOR, BulkChangePanelComponent, injector);

  bootstrapCrtModule(REMOTE_NAME, DesignFeatureModule, {
    resolveDependency: (token: unknown) => injector.get(token as ProviderToken<unknown>),
  });
}
