import { Injector, ProviderToken, Type } from '@angular/core';
import { createCustomElement } from '@angular/elements';
import { bootstrapCrtModule } from '@creatio-devkit/common';

import { ensureFeatureModuleRef } from '../../remote-app-context';
import { RuntimeFeatureModule } from './runtime-feature.module';
import { BULK_CHANGE_SELECTOR, REMOTE_NAME } from './runtime-feature.ids';
import { BulkChangeComponent } from './view-elements/bulk-change/bulk-change.component';

function defineCustomElement(selector: string, component: Type<unknown>, injector: Injector): void {
  if (!customElements.get(selector)) {
    customElements.define(selector, createCustomElement(component, { injector }));
  }
}

/**
 * Initializes the runtime feature module, registers its custom elements, and boots the Creatio runtime integration.
 */
export async function activateRuntimeFeature(): Promise<void> {
  const moduleRef = await ensureFeatureModuleRef(RuntimeFeatureModule);
  const injector = moduleRef.injector;

  defineCustomElement(BULK_CHANGE_SELECTOR, BulkChangeComponent, injector);

  bootstrapCrtModule(REMOTE_NAME, RuntimeFeatureModule, {
    resolveDependency: (token: unknown) => injector.get(token as ProviderToken<unknown>),
  });
}
