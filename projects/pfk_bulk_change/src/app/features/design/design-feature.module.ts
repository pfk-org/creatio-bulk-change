import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CrtModule } from '@creatio-devkit/common';
import { BulkChangePanelComponent } from './property-panels/bulk-change-panel/bulk-change-panel.component';

@CrtModule({
  viewElements: [BulkChangePanelComponent],
})
@NgModule({
  declarations: [BulkChangePanelComponent],
  imports: [CommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DesignFeatureModule {}
