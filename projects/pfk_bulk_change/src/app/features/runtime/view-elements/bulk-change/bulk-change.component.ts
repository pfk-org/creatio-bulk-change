import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  EventEmitter,
  HostBinding,
  Input,
  OnChanges,
  OnInit,
  Output,
  signal,
  SimpleChanges,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import { CrtInput, CrtOutput, CrtViewElement, LookupValue } from '@creatio-devkit/common';

import { BulkChangeDataService, getErrorMessage } from '../../../../shared/bulk-change-data.service';
import {
  BulkChangeCompletedEvent,
  BulkChangeResult,
  BulkChangeValue,
  DEFAULT_BATCH_SIZE,
  DEFAULT_MAX_RECORDS,
  EditableColumn,
  GridColumnConfig,
  GridSelectionState,
  ValueEditorKind,
} from '../../../../shared/bulk-change.models';
import { getEditableColumns } from '../../../../shared/column-utils';
import { getCurrentPageSchemaName } from '../../../../shared/page-context';
import { watchLiveUpdates } from '../../../../shared/live-update-watcher';
import { withPageMask } from '../../../../shared/page-mask';
import {
  BulkChangeStrings,
  DEFAULT_STRINGS,
  format,
  getStrings,
  getUserCultureName,
} from '../../../../shared/i18n';
import { EditorRawValue, formatValue, parseEditorValue } from '../../../../shared/value-utils';
import { SelectionFilters } from '../../requests/resolve-bulk-change-filters.handler';
import { BULK_CHANGE_SELECTOR, BULK_CHANGE_TYPE } from '../../runtime-feature.ids';

/**
 * Dialog steps: choose a field and value → confirm the number of records → run (the dialog is closed
 * and the page is masked) → see the errors, when some records were not changed.
 */
type DialogStep = 'form' | 'counting' | 'confirm' | 'running' | 'done';

/**
 * Payload of the `filtersRequested` output.
 */
export interface FiltersRequestedEvent {
  resolve: (filters: SelectionFilters | null) => void;
}

const FILTERS_REQUEST_TIMEOUT_MS = 5000;

let nextId = 0;

/**
 * Bulk change of one field for the records selected in a Freedom UI list.
 *
 * The properties panel links the component to a list: it binds `selectionState` and `filters`
 * to the list and copies the entity name and the list columns, so only columns shown in the list
 * can be changed.
 */
@CrtViewElement({
  selector: BULK_CHANGE_SELECTOR,
  type: BULK_CHANGE_TYPE,
})
@Component({
  selector: 'pfk-bulk-change-internal',
  templateUrl: './bulk-change.component.html',
  styleUrls: ['./bulk-change.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
  standalone: false,
})
export class BulkChangeComponent implements OnInit, OnChanges {
  /**
   * Visibility, the same property out-of-the-box components have: set in the properties panel or
   * bound to an attribute by a business rule.
   */
  @Input() @CrtInput() public visible = true;

  @HostBinding('style.display')
  protected get hostDisplay(): string | null {
    return this.visible === false ? 'none' : null;
  }

  /** Button caption; the localized "Bulk change" is used when empty. */
  @Input() @CrtInput() public caption = '';

  /** Code of the linked list on the page; kept for the properties panel. */
  @Input() @CrtInput() public dataGridName = '';

  /** Entity of the linked list, for example `Contact`. */
  @Input() @CrtInput() public entitySchemaName = '';

  /** Data source of the linked list; used to resolve column paths such as `PDS_Name`. */
  @Input() @CrtInput() public dataSourceName = '';

  /** Columns of the linked list. */
  @Input() @CrtInput() public columns: GridColumnConfig[] = [];

  /** Selection of the linked list (`$<List>_SelectionState`). */
  @Input() @CrtInput() public selectionState: GridSelectionState | null = null;


  /** Number of records updated by one request. */
  @Input() @CrtInput() public batchSize = DEFAULT_BATCH_SIZE;

  /** Maximum number of records one run may change. */
  @Input() @CrtInput() public maxRecords = DEFAULT_MAX_RECORDS;

  /**
   * Asks the page for the current list selection filters. The properties panel binds it to
   * `pfk.ResolveBulkChangeFiltersRequest`; the page evaluates the filters at dispatch time and
   * passes them to `resolve`. Used only for "select all".
   */
  @Output() @CrtOutput() public readonly filtersRequested = new EventEmitter<FiltersRequestedEvent>();

  /** Emitted after a run that changed at least one record; the page binds it to reload the list. */
  @Output() @CrtOutput() public readonly bulkChangeCompleted = new EventEmitter<BulkChangeCompletedEvent>();

  @ViewChild('dialog') private _dialogRef?: ElementRef<HTMLElement>;
  @ViewChild('openButton') private _openButtonRef?: ElementRef<HTMLButtonElement>;

  protected readonly ids = (() => {
    const prefix = `pfk-bulk-change-${nextId++}`;
    return {
      title: `${prefix}-title`,
      field: `${prefix}-field`,
      value: `${prefix}-value`,
      clear: `${prefix}-clear`,
      error: `${prefix}-error`,
      hint: `${prefix}-hint`,
    };
  })();

  protected readonly ValueEditorKind = ValueEditorKind;
  protected readonly strings = signal<BulkChangeStrings>(DEFAULT_STRINGS);
  protected readonly hasRights = signal<boolean | null>(null);
  protected readonly editableColumns = signal<EditableColumn[]>([]);
  protected readonly loadError = signal('');
  protected readonly selection = signal<GridSelectionState | null>(null);

  protected readonly isDialogOpen = signal(false);
  protected readonly step = signal<DialogStep>('form');
  protected readonly selectedColumnName = signal('');
  protected readonly rawValue = signal<EditorRawValue>(null);
  protected readonly clearValue = signal(false);
  protected readonly validationError = signal('');
  protected readonly recordIds = signal<string[]>([]);
  protected readonly pendingValue = signal<BulkChangeValue>(null);
  protected readonly result = signal<BulkChangeResult | null>(null);

  protected readonly isConfigured = computed(() => Boolean(this._entitySchemaName()));
  /** Records the run would change: selected Ids, or the counted "select all" records. */
  protected readonly selectedCountLabel = computed(() => {
    const selection = this.selection();
    if (selection?.type === 'specific') {
      return String(selection.selected.length);
    }
    if (selection?.type === 'all') {
      const count = this._allRecordsCount();
      return count === null ? '…' : count > this._maxRecords() ? `${this._maxRecords()}+` : String(count);
    }
    return '0';
  });
  protected readonly hasSelection = computed(() => {
    const selection = this.selection();
    return selection?.type === 'all' || (selection?.type === 'specific' && selection.selected.length > 0);
  });
  protected readonly canOpen = computed(
    () => this.isConfigured() && this.hasRights() === true && this.hasSelection(),
  );
  protected readonly selectedColumn = computed(
    () => this.editableColumns().find((column) => column.name === this.selectedColumnName()) ?? null,
  );
  protected readonly fieldOptions = computed<LookupValue[]>(() =>
    this.editableColumns().map((column) => ({ value: column.name, displayValue: column.caption })),
  );
  protected readonly selectedColumnAsList = computed(() => {
    const column = this.selectedColumn();
    return column ? [column] : [];
  });
  protected readonly buttonCaption = computed(() => this._caption() || this.strings().buttonCaption);
  /** Why the button is disabled (announced to screen readers only, so the layout never jumps). */
  protected readonly disabledReason = computed(() => {
    const strings = this.strings();
    if (!this.isConfigured()) {
      return strings.notConfigured;
    }
    if (this.hasRights() === false) {
      return strings.noRights;
    }
    return this.hasSelection() ? '' : strings.noSelectionHint;
  });
  private readonly _entitySchemaName = signal('');
  private readonly _caption = signal('');
  private readonly _allRecordsCount = signal<number | null>(null);
  private _countVersion = 0;

  constructor(private readonly _dataService: BulkChangeDataService) {}

  public async ngOnInit(): Promise<void> {
    const [cultureName, hasRights] = await Promise.all([
      getUserCultureName(),
      this._dataService.canUseBulkChange(),
    ]);
    this.strings.set(getStrings(cultureName));
    this.hasRights.set(hasRights);
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['caption']) {
      this._caption.set(this.caption ?? '');
    }
    if (changes['selectionState']) {
      this.selection.set(normalizeSelectionState(this.selectionState));
      void this._countAllRecords();
    }
    if (changes['entitySchemaName'] || changes['columns'] || changes['dataSourceName']) {
      this._entitySchemaName.set(this.entitySchemaName ?? '');
      void this._loadEditableColumns();
      if (changes['entitySchemaName'] && !changes['selectionState']) {
        void this._countAllRecords();
      }
    }
  }

  protected async openDialog(): Promise<void> {
    if (!this.canOpen()) {
      return;
    }
    this._resetForm();
    this.isDialogOpen.set(true);
    // Re-read the columns: the user may have added a column to the list since the page opened.
    await this._loadEditableColumns();
    setTimeout(() => this._focusFirstControl());
  }

  protected closeDialog(): void {
    if (this.step() === 'running' || this.step() === 'counting') {
      return;
    }
    this.isDialogOpen.set(false);
    setTimeout(() => this._openButtonRef?.nativeElement.focus());
  }

  protected onFieldChange(option: LookupValue | null): void {
    this.selectedColumnName.set(option ? String(option.value) : '');
    this.rawValue.set(this.selectedColumn()?.editor === ValueEditorKind.Boolean ? 'true' : null);
    this.clearValue.set(false);
    this.validationError.set('');
  }

  protected onRawValueInput(event: Event): void {
    this.rawValue.set((event.target as HTMLInputElement).value);
    this.validationError.set('');
  }

  protected onLookupValueChange(value: LookupValue | null): void {
    this.rawValue.set(value);
    this.validationError.set('');
  }

  protected onClearValueChange(event: Event): void {
    this.clearValue.set((event.target as HTMLInputElement).checked);
    this.validationError.set('');
  }

  /**
   * Validates the value and resolves the records to change.
   */
  protected async prepare(): Promise<void> {
    const column = this.selectedColumn();
    const strings = this.strings();
    if (!column) {
      this.validationError.set(strings.fieldPlaceholder);
      return;
    }
    let value: BulkChangeValue = null;
    if (!this.clearValue()) {
      const parsed = parseEditorValue(column.editor, this.rawValue());
      if (!parsed.ok) {
        this.validationError.set(strings[parsed.error]);
        return;
      }
      value = parsed.value;
    }
    this.pendingValue.set(value);
    this.step.set('counting');
    try {
      const maxRecords = this._maxRecords();
      const ids = await this._resolveRecordIds(maxRecords);
      if (ids.length > maxRecords) {
        this.step.set('form');
        this.validationError.set(format(strings.limitExceeded, { count: `${maxRecords}+`, max: maxRecords }));
        return;
      }
      this.recordIds.set(ids);
      this.step.set('confirm');
    } catch (error) {
      this.step.set('form');
      this.validationError.set(format(strings.loadError, { message: getErrorMessage(error) }));
    }
  }

  /**
   * Closes the dialog and changes the records under the page mask. After the last batch the mask
   * stays until the live data update notifications of the entity stop (at least 2 s), so the list
   * reload never runs under the platform's own row re-reads and the user never sees the list half
   * updated. Then the page shows the result notification and reloads the list. The dialog opens
   * again only to list the errors.
   */
  protected async run(): Promise<void> {
    const column = this.selectedColumn();
    if (!column) {
      return;
    }
    this.step.set('running');
    this.isDialogOpen.set(false);
    const result = await withPageMask(async () => {
      const liveUpdates = await watchLiveUpdates(this._entitySchemaName());
      try {
        const runResult = await this._dataService.run({
          entitySchemaName: this._entitySchemaName(),
          column,
          value: this.pendingValue(),
          recordIds: this.recordIds(),
          batchSize: this._batchSize(),
        });
        if (runResult.updated > 0) {
          await liveUpdates.waitUntilQuiet();
        }
        return runResult;
      } finally {
        liveUpdates.dispose();
      }
    });
    this.result.set(result);
    this.step.set('done');
    if (result.updated > 0) {
      this.bulkChangeCompleted.emit(this._createCompletedEvent(column, result));
    }
    if (result.failed > 0) {
      this.isDialogOpen.set(true);
      setTimeout(() => this._focusFirstControl());
    } else {
      setTimeout(() => this._openButtonRef?.nativeElement.focus());
    }
  }

  private _createCompletedEvent(column: EditableColumn, result: BulkChangeResult): BulkChangeCompletedEvent {
    const strings = this.strings();
    return {
      entitySchemaName: this._entitySchemaName(),
      columnName: column.name,
      updated: result.updated,
      failed: result.failed,
      stopped: result.stopped,
      message: format(result.failed ? strings.notifyPartial : strings.notifyDone, {
        updated: result.updated,
        failed: result.failed,
      }),
    };
  }

  protected backToForm(): void {
    this.step.set('form');
  }

  /**
   * Data of the confirmation step: how many records, which field and the new value.
   */
  protected confirmation(): { count: number; field: string; value: string; isCleared: boolean } {
    const column = this.selectedColumn();
    const strings = this.strings();
    const value = this.pendingValue();
    return {
      count: this.recordIds().length,
      field: column?.caption ?? '',
      value: value === null ? strings.emptyValue : formatValue(value, column?.editor ?? ValueEditorKind.Text, strings),
      isCleared: value === null,
    };
  }

  protected inputType(kind: ValueEditorKind): string {
    switch (kind) {
      case ValueEditorKind.Integer:
      case ValueEditorKind.Decimal:
        return 'number';
      case ValueEditorKind.Date:
        return 'date';
      case ValueEditorKind.DateTime:
        return 'datetime-local';
      case ValueEditorKind.Time:
        return 'time';
      default:
        return 'text';
    }
  }

  protected format(template: string, values: Record<string, string | number>): string {
    return format(template, values);
  }

  /**
   * Keeps keyboard focus inside the modal dialog and closes it on Escape.
   */
  protected onDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeDialog();
      return;
    }
    if (event.key !== 'Tab' || !this._dialogRef) {
      return;
    }
    const focusable = getFocusableElements(this._dialogRef.nativeElement);
    if (!focusable.length) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = (this._dialogRef.nativeElement.getRootNode() as ShadowRoot).activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /**
   * Resolves the Ids for the current selection; for "select all" asks the page for fresh list filters.
   */
  private async _resolveRecordIds(limit: number): Promise<string[]> {
    const selection = this.selection();
    if (selection?.type !== 'all') {
      return this._dataService.resolveRecordIds(this._entitySchemaName(), selection, null, limit);
    }
    const listFilters = await this._requestListFilters();
    if (!listFilters) {
      throw new Error(this.strings().listFiltersUnavailable);
    }
    return this._dataService.resolveRecordIds(this._entitySchemaName(), selection, listFilters, limit);
  }

  /**
   * Emits `filtersRequested` and waits for the page to return the current list filters.
   * Resolves `null` when the page does not answer (the output is not bound).
   */
  private _requestListFilters(): Promise<SelectionFilters | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), FILTERS_REQUEST_TIMEOUT_MS);
      this.filtersRequested.emit({
        resolve: (filters) => {
          clearTimeout(timer);
          resolve(filters ?? null);
        },
      });
    });
  }

  private async _countAllRecords(): Promise<void> {
    const version = ++this._countVersion;
    this._allRecordsCount.set(null);
    if (this.selection()?.type !== 'all' || !this._entitySchemaName()) {
      return;
    }
    try {
      const ids = await this._resolveRecordIds(this._maxRecords());
      if (version === this._countVersion) {
        this._allRecordsCount.set(ids.length);
      }
    } catch {
      // The count is informative only; the run reports errors itself.
    }
  }

  private async _loadEditableColumns(): Promise<void> {
    const entitySchemaName = this.entitySchemaName;
    this.loadError.set('');
    if (!entitySchemaName) {
      this.editableColumns.set([]);
      return;
    }
    try {
      const [schema, gridColumns] = await Promise.all([
        this._dataService.getSchema(entitySchemaName),
        this._getGridColumns(),
      ]);
      this.editableColumns.set(getEditableColumns(schema, gridColumns, this.dataSourceName));
    } catch (error) {
      this.editableColumns.set([]);
      this.loadError.set(format(this.strings().loadError, { message: getErrorMessage(error) }));
    }
  }

  /**
   * Columns of the list as the user sees it: the columns the user configured at runtime (grid profile)
   * when present, otherwise the columns configured in the designer.
   */
  private async _getGridColumns(): Promise<GridColumnConfig[]> {
    const designerColumns = this.columns ?? [];
    try {
      const profileColumns = await this._dataService.loadGridProfileColumns(
        getCurrentPageSchemaName(),
        this.dataGridName,
      );
      return profileColumns?.length ? profileColumns : designerColumns;
    } catch (error) {
      console.warn('[PfkBulkChange] Could not read the list profile, designer columns are used', error);
      return designerColumns;
    }
  }

  private _resetForm(): void {
    this.step.set('form');
    this.selectedColumnName.set('');
    this.rawValue.set(null);
    this.clearValue.set(false);
    this.validationError.set('');
    this.recordIds.set([]);
    this.result.set(null);
  }

  private _focusFirstControl(): void {
    const dialog = this._dialogRef?.nativeElement;
    getFocusableElements(dialog)[0]?.focus();
  }

  private _batchSize(): number {
    const value = Number(this.batchSize);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_BATCH_SIZE;
  }

  /** The configured limit, never above {@link DEFAULT_MAX_RECORDS}: the most one platform query reads. */
  private _maxRecords(): number {
    const value = Number(this.maxRecords);
    return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), DEFAULT_MAX_RECORDS) : DEFAULT_MAX_RECORDS;
  }
}

/**
 * Accepts the platform selection state and tolerates partially filled values.
 */
export function normalizeSelectionState(value: unknown): GridSelectionState | null {
  const state = value as { type?: string; selected?: unknown; unselected?: unknown } | null;
  if (state?.type === 'all') {
    return { type: 'all', unselected: Array.isArray(state.unselected) ? (state.unselected as string[]) : [] };
  }
  if (state?.type === 'specific') {
    return { type: 'specific', selected: Array.isArray(state.selected) ? (state.selected as string[]) : [] };
  }
  return null;
}

function getFocusableElements(root: HTMLElement | undefined): HTMLElement[] {
  if (!root) {
    return [];
  }
  const selector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(root.querySelectorAll<HTMLElement>(selector));
}
