import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InterfaceDesignerSchemaService, ViewNodeEditor, ViewNodePropertyValueType } from '@creatio/interface-designer';

import * as i18n from '../../../../shared/i18n';
import { BulkChangePanelComponent } from './bulk-change-panel.component';
import * as gridLink from './grid-link';

const link = (gridName: string, entitySchemaName: string): gridLink.GridLink => ({
  gridName,
  itemsAttributeName: gridName === 'DataTable' ? 'Items' : gridName,
  selectionStateAttributeName: `${gridName}_SelectionState`,
  dataSourceName: `${gridName}DS`,
  entitySchemaName,
  columns: [],
});

describe('BulkChangePanelComponent', () => {
  let fixture: ComponentFixture<BulkChangePanelComponent>;
  let element: HTMLElement;
  let properties: Record<string, unknown>;
  let editor: { nodeName: string; getPropertyValue: jest.Mock; setPropertyValue: jest.Mock };

  async function settle(): Promise<void> {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }

  function query<T extends HTMLElement>(testId: string): T | null {
    return element.querySelector<T>(`[data-testid="${testId}"]`);
  }

  function key(target: HTMLElement, name: string): void {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    jest.spyOn(i18n, 'getUserCultureName').mockResolvedValue('en-US');
    jest.spyOn(InterfaceDesignerSchemaService.prototype, 'getSchemaEditor').mockReturnValue({} as never);
    jest.spyOn(gridLink, 'discoverGridLinks').mockResolvedValue([link('DataTable', 'Account'), link('Dashboards', 'Account')]);
    properties = { dataGridName: { type: ViewNodePropertyValueType.Constant, value: 'DataTable' } };
    editor = {
      nodeName: 'BulkChange_1',
      getPropertyValue: jest.fn(async (name: string) => properties[name]),
      setPropertyValue: jest.fn(async (name: string, options: { constant?: unknown }) => {
        if ('constant' in options) {
          properties[name] = { type: ViewNodePropertyValueType.Constant, value: options.constant };
        }
      }),
    };
    await TestBed.configureTestingModule({
      declarations: [BulkChangePanelComponent],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();
    fixture = TestBed.createComponent(BulkChangePanelComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('viewNodeEditor', editor as unknown as ViewNodeEditor);
    await settle();
    await settle();
  });

  afterEach(() => jest.restoreAllMocks());

  it('shows the linked list like the out-of-the-box combobox and the element code', () => {
    const combobox = query<HTMLButtonElement>('grid-select')!;
    expect(combobox.getAttribute('role')).toBe('combobox');
    expect(combobox.getAttribute('aria-expanded')).toBe('false');
    expect(combobox.textContent?.trim()).toBe('List Account | DataTable');
    expect(query<HTMLInputElement>('element-code')!.value).toBe('BulkChange_1');
    expect(query('batch-size')).toBeNull();
    expect(query('max-records')).toBeNull();
  });

  it('chooses another list with the keyboard', async () => {
    const combobox = query<HTMLButtonElement>('grid-select')!;
    key(combobox, 'ArrowDown');
    expect(combobox.getAttribute('aria-expanded')).toBe('true');
    const options = Array.from(element.querySelectorAll('[role="option"]')).map((option) => option.textContent?.trim());
    expect(options).toEqual(['List Account | DataTable', 'List Account | Dashboards', 'Other list (enter the code)…']);
    key(combobox, 'ArrowDown');
    key(combobox, 'Enter');
    await settle();
    expect(query('grid-listbox')).toBeNull();
    expect(editor.setPropertyValue).toHaveBeenCalledWith('dataGridName', { constant: 'Dashboards' });
    expect(combobox.textContent?.trim()).toBe('List Account | Dashboards');
  });

  it('opens the list code field for "Other list"', async () => {
    query<HTMLButtonElement>('grid-select')!.click();
    fixture.detectChanges();
    const other = Array.from(element.querySelectorAll<HTMLElement>('[role="option"]')).pop()!;
    other.click();
    await settle();
    expect(query('grid-code')).not.toBeNull();
    expect(query('grid-select')!.textContent?.trim()).toBe('Other list (enter the code)…');
  });

  it('closes the list on Escape', () => {
    const combobox = query<HTMLButtonElement>('grid-select')!;
    combobox.click();
    fixture.detectChanges();
    expect(query('grid-listbox')).not.toBeNull();
    key(combobox, 'Escape');
    expect(query('grid-listbox')).toBeNull();
  });
});
