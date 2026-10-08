import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CrtModule } from '@creatio-devkit/common';

import { BulkChangeCompletedHandler } from './requests/bulk-change-completed.handler';
import { ResolveBulkChangeFiltersHandler } from './requests/resolve-bulk-change-filters.handler';
import { BulkChangeComponent } from './view-elements/bulk-change/bulk-change.component';
import { LookupComboboxComponent } from './view-elements/lookup-combobox/lookup-combobox.component';

@CrtModule({
  viewElements: [BulkChangeComponent],
  requestHandlers: [ResolveBulkChangeFiltersHandler, BulkChangeCompletedHandler],
})
@NgModule({
  declarations: [BulkChangeComponent, LookupComboboxComponent],
  imports: [CommonModule],
  providers: [ResolveBulkChangeFiltersHandler, BulkChangeCompletedHandler],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class RuntimeFeatureModule {}
