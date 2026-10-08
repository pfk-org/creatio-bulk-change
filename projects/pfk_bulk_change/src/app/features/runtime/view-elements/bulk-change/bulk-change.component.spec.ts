import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DataValueType } from '@creatio-devkit/common';

import { BulkChangeDataService } from '../../../../shared/bulk-change-data.service';
import { BulkChangeCompletedEvent, GridColumnConfig, GridSelectionState } from '../../../../shared/bulk-change.models';
import * as i18n from '../../../../shared/i18n';
import * as liveUpdateWatcher from '../../../../shared/live-update-watcher';
import * as pageMask from '../../../../shared/page-mask';
import { LookupComboboxComponent } from '../lookup-combobox/lookup-combobox.component';
import { BulkChangeComponent, FiltersRequestedEvent, normalizeSelectionState } from './bulk-change.component';

@Component({
  standalone: false,
  template: `
    <pfk-bulk-change-internal
      [entitySchemaName]="entitySchemaName"
      [dataSourceName]="'PDS'"
      [columns]="columns"
      [selectionState]="selectionState"
      [batchSize]="2"
      (bulkChangeCompleted)="completed($event)"
      (filtersRequested)="filtersRequested($event)"
    ></pfk-bulk-change-internal>
  `,
})
class TestHostComponent {
  public entitySchemaName = 'Contact';
  public columns: GridColumnConfig[] = [{ code: 'PDS_JobTitle', path: 'JobTitle' }];
  public selectionState: GridSelectionState | null = { type: 'specific', selected: ['id-1', 'id-2'] };
  public readonly completed = jest.fn<void, [BulkChangeCompletedEvent]>();
  public listFilters: object | null = { items: { search: {} } };
  public readonly filtersRequested = jest.fn((event: FiltersRequestedEvent) => event.resolve(this.listFilters as never));

  @ViewChild(BulkChangeComponent) public component!: BulkChangeComponent;
}

describe('BulkChangeComponent', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;
  let maskEvents: string[];
  /** Ends the wait for the live data update notifications of the run. */
  let liveUpdatesQuiet: () => void;
  let dataService: jest.Mocked<Pick<BulkChangeDataService, 'canUseBulkChange' | 'loadGridProfileColumns' | 'getSchema' | 'resolveRecordIds' | 'run' | 'searchLookupValues'>>;

  function shadow(): ShadowRoot {
    const element = fixture.nativeElement.querySelector('pfk-bulk-change-internal') as HTMLElement;
    return element.shadowRoot as ShadowRoot;
  }

  function query<T extends HTMLElement>(testId: string): T | null {
    return shadow().querySelector<T>(`[data-testid="${testId}"]`);
  }

  /**
   * Picks a field in the field combobox the way a user does: focus the input and click the option.
   */
  async function chooseField(caption: string): Promise<void> {
    const input = shadow().querySelector<HTMLInputElement>('[data-testid="field-select"] input')!;
    input.dispatchEvent(new Event('focus'));
    await settle();
    const option = Array.from(shadow().querySelectorAll<HTMLElement>('[role="option"]')).find(
      (element) => element.textContent?.trim() === caption,
    );
    option!.click();
    fixture.detectChanges();
    await settle();
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    jest.spyOn(i18n, 'getUserCultureName').mockResolvedValue('en-US');
    maskEvents = [];
    jest.spyOn(pageMask, 'withPageMask').mockImplementation(async (work) => {
      maskEvents.push('show');
      try {
        return await work();
      } finally {
        maskEvents.push('hide');
      }
    });
    jest.spyOn(liveUpdateWatcher, 'watchLiveUpdates').mockImplementation(async () => {
      const quiet = new Promise<void>((resolve) => (liveUpdatesQuiet = resolve));
      return {
        waitUntilQuiet: () => quiet.then(() => void maskEvents.push('quiet')),
        dispose: () => maskEvents.push('dispose'),
      };
    });
    dataService = {
      canUseBulkChange: jest.fn().mockResolvedValue(true),
      loadGridProfileColumns: jest.fn().mockResolvedValue(null),
      getSchema: jest.fn().mockResolvedValue({
        name: 'Contact',
        primaryAttributeName: 'Id',
        attributes: [
          { name: 'JobTitle', caption: 'Job title', dataValueType: DataValueType.MEDIUM_TEXT, attributeType: 'Own', isRequired: false },
        ],
      }),
      resolveRecordIds: jest.fn().mockResolvedValue(['id-1', 'id-2']),
      run: jest.fn().mockImplementation(async () => {
        maskEvents.push('run');
        return { total: 2, processed: 2, updated: 2, failed: 0, stopped: false, errors: [] };
      }),
      searchLookupValues: jest.fn().mockResolvedValue([]),
    };
    await TestBed.configureTestingModule({
      declarations: [BulkChangeComponent, LookupComboboxComponent, TestHostComponent],
      providers: [{ provide: BulkChangeDataService, useValue: dataService }],
    }).compileComponents();
    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => jest.restoreAllMocks());

  it('renders in shadow DOM', () => {
    expect(shadow()).not.toBeNull();
    expect(query('open-button')?.tagName).toBe('BUTTON');
  });

  it('shows the number of selected records in the caption', () => {
    const button = query<HTMLButtonElement>('open-button')!;
    expect(button.disabled).toBe(false);
    expect(query('open-button-caption')?.textContent?.trim()).toBe('Bulk change');
    expect(query('selected-count')?.textContent?.trim()).toBe('2');
    expect(query('open-button')?.textContent).toContain('Selected records: 2');
  });

  it('shows (0) and a disabled button when nothing is selected, without a visible hint', async () => {
    host.selectionState = { type: 'specific', selected: [] };
    fixture.detectChanges();
    await settle();
    const button = query<HTMLButtonElement>('open-button')!;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(query('selected-count')?.textContent?.trim()).toBe('0');
    const reason = query('disabled-reason')!;
    expect(reason.classList).toContain('visually-hidden');
    expect(button.getAttribute('aria-describedby')).toBe(reason.id);
  });

  it('counts "select all" records using the filters returned by the page', async () => {
    dataService.resolveRecordIds.mockResolvedValue(['a', 'b', 'c', 'd', 'e']);
    host.selectionState = { type: 'all', unselected: ['z'] };
    fixture.detectChanges();
    await settle();
    expect(host.filtersRequested).toHaveBeenCalled();
    expect(dataService.resolveRecordIds).toHaveBeenLastCalledWith(
      'Contact',
      { type: 'all', unselected: ['z'] },
      host.listFilters,
      expect.any(Number),
    );
    expect(query('selected-count')?.textContent?.trim()).toBe('5');
  });

  it('never asks the page for filters for a specific selection', async () => {
    query<HTMLButtonElement>('open-button')!.click();
    await settle();
    await chooseField('Job title');

    const clear = query<HTMLInputElement>('clear-value')!;
    clear.checked = true;
    clear.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    query<HTMLButtonElement>('apply-button')!.click();
    await settle();
    expect(host.filtersRequested).not.toHaveBeenCalled();
    expect(dataService.resolveRecordIds).toHaveBeenCalledWith(
      'Contact',
      { type: 'specific', selected: ['id-1', 'id-2'] },
      null,
      expect.any(Number),
    );
  });

  it('disables the button without the system operation', async () => {
    dataService.canUseBulkChange.mockResolvedValue(false);
    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    await settle();
    expect(query<HTMLButtonElement>('open-button')!.disabled).toBe(true);
    expect(query('disabled-reason')?.textContent).toContain('permission');
  });

  it('runs the change for the selected records and emits the result', async () => {
    query<HTMLButtonElement>('open-button')!.click();
    await settle();
    const dialog = query('dialog')!;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');

    await chooseField('Job title');

    const input = query<HTMLInputElement>('value-input')!;
    expect(shadow().querySelector(`label[for="${input.id}"]`)).not.toBeNull();
    input.value = 'Manager';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    query<HTMLButtonElement>('apply-button')!.click();
    await settle();
    expect(query('confirm-count')?.textContent?.trim()).toBe('2');
    expect(query('confirm-field')?.textContent?.trim()).toBe('Job title');
    expect(query('confirm-value')?.textContent?.trim()).toBe('Manager');
    expect(query('confirm-button')?.textContent?.trim()).toBe('Change 2');

    query<HTMLButtonElement>('confirm-button')!.click();
    await settle();
    // The dialog closes at once and the page is masked while the records change.
    expect(query('dialog')).toBeNull();
    expect(dataService.run).toHaveBeenCalledWith(
      expect.objectContaining({ entitySchemaName: 'Contact', value: 'Manager', recordIds: ['id-1', 'id-2'], batchSize: 2 }),
    );
    // The mask stays until the live data update notifications stop; the notification and the list reload follow it.
    expect(maskEvents).toEqual(['show', 'run']);
    expect(host.completed).not.toHaveBeenCalled();
    liveUpdatesQuiet();
    await settle();
    expect(maskEvents).toEqual(['show', 'run', 'quiet', 'dispose', 'hide']);
    expect(query('dialog')).toBeNull();
    expect(host.completed).toHaveBeenCalledWith(
      expect.objectContaining({
        entitySchemaName: 'Contact',
        columnName: 'JobTitle',
        updated: 2,
        message: 'Bulk change completed: 2 records updated',
      }),
    );
  });

  it('opens the dialog again with the errors when some records were not updated', async () => {
    dataService.run.mockResolvedValue({
      total: 2, processed: 2, updated: 1, failed: 1, stopped: false, errors: ['id-2: No edit rights'],
    });
    query<HTMLButtonElement>('open-button')!.click();
    await settle();
    await chooseField('Job title');
    const clear = query<HTMLInputElement>('clear-value')!;
    clear.checked = true;
    clear.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    query<HTMLButtonElement>('apply-button')!.click();
    await settle();
    query<HTMLButtonElement>('confirm-button')!.click();
    await settle();
    liveUpdatesQuiet();
    await settle();
    expect(maskEvents).toEqual(['show', 'quiet', 'dispose', 'hide']);
    expect(query('result')?.textContent).toContain('No edit rights');
    expect(host.completed).toHaveBeenCalledWith(expect.objectContaining({ updated: 1, failed: 1 }));
  });

  it('requires a value unless "Clear value" is checked', async () => {
    query<HTMLButtonElement>('open-button')!.click();
    await settle();
    await chooseField('Job title');


    query<HTMLButtonElement>('apply-button')!.click();
    await settle();
    expect(query('validation-error')?.getAttribute('role')).toBe('alert');
    expect(dataService.resolveRecordIds).not.toHaveBeenCalled();

    const clear = query<HTMLInputElement>('clear-value')!;
    clear.checked = true;
    clear.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    query<HTMLButtonElement>('apply-button')!.click();
    await settle();
    expect(query('confirm-value')?.textContent?.trim()).toBe('(empty)');
    expect(shadow().querySelector('[data-testid="confirm-value"] .chip')?.classList).toContain('chip--empty');
  });

  it('refuses to run when the limit is exceeded', async () => {
    host.component.maxRecords = 1;
    query<HTMLButtonElement>('open-button')!.click();
    await settle();
    await chooseField('Job title');

    const clear = query<HTMLInputElement>('clear-value')!;
    clear.checked = true;
    clear.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    query<HTMLButtonElement>('apply-button')!.click();
    await settle();
    expect(query('validation-error')?.textContent).toContain('up to 1 records');
    expect(query('confirm-message')).toBeNull();
  });

  it('offers columns the user added to the list at runtime (grid profile)', async () => {
    dataService.loadGridProfileColumns.mockResolvedValue([{ code: 'PDS_JobTitle', path: 'JobTitle' }]);
    host.columns = [];
    fixture.detectChanges();
    await settle();
    query<HTMLButtonElement>('open-button')!.click();
    await settle();
    expect(dataService.loadGridProfileColumns).toHaveBeenCalled();
    expect(query('no-columns')).toBeNull();
    await chooseField('Job title');
    expect(query('value-input')).not.toBeNull();
  });

  it('hides itself when visible is false', async () => {
    host.component.visible = false;
    fixture.detectChanges();
    const element = fixture.nativeElement.querySelector('pfk-bulk-change-internal') as HTMLElement;
    expect(element.style.display).toBe('none');
  });

  it('closes the dialog on Escape', async () => {
    query<HTMLButtonElement>('open-button')!.click();
    await settle();
    query('dialog')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(query('dialog')).toBeNull();
  });

  it('shows a message when the list has no changeable columns', async () => {
    host.columns = [{ code: 'PDS_Id', path: 'Id' }];
    fixture.detectChanges();
    await settle();
    query<HTMLButtonElement>('open-button')!.click();
    await settle();
    expect(query('no-columns')).not.toBeNull();
  });
});

describe('normalizeSelectionState', () => {
  it('normalizes platform selection states', () => {
    expect(normalizeSelectionState({ type: 'specific', selected: ['a'] })).toEqual({ type: 'specific', selected: ['a'] });
    expect(normalizeSelectionState({ type: 'all' })).toEqual({ type: 'all', unselected: [] });
    expect(normalizeSelectionState(null)).toBeNull();
    expect(normalizeSelectionState({ type: 'unknown' })).toBeNull();
  });
});
