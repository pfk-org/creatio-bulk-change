import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { LookupValue } from '@creatio-devkit/common';

import { BulkChangeDataService, getErrorMessage } from '../../../../shared/bulk-change-data.service';
import { BulkChangeStrings, DEFAULT_STRINGS } from '../../../../shared/i18n';

const SEARCH_DEBOUNCE_MS = 300;
let nextId = 0;

/**
 * Value picker (WAI-ARIA combobox with a listbox) used inside the bulk change dialog.
 *
 * Two modes:
 * - lookup values: set `referenceSchemaName`, values are searched on the server;
 * - fixed options: set `staticOptions` (for example the list of fields), options are filtered locally.
 */
@Component({
  selector: 'pfk-lookup-combobox',
  templateUrl: './lookup-combobox.component.html',
  styleUrls: ['./lookup-combobox.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.Emulated,
  standalone: false,
})
export class LookupComboboxComponent implements OnDestroy {
  @Input() public referenceSchemaName = '';
  /** Fixed options filtered locally; when set, the server is not queried. */
  @Input() public staticOptions: LookupValue[] | null = null;
  @Input() public placeholder = '';
  @Input() public inputId = `pfk-lookup-${nextId++}`;
  @Input() public isDisabled = false;
  @Input() public strings: BulkChangeStrings = DEFAULT_STRINGS;

  @Input()
  public set selectedValue(value: LookupValue | null) {
    this.selected.set(value);
    this.searchText.set(value?.displayValue ?? '');
  }

  @Output() public readonly selectedValueChange = new EventEmitter<LookupValue | null>();

  protected get listboxId(): string {
    return `${this.inputId}-listbox`;
  }

  protected readonly selected = signal<LookupValue | null>(null);
  protected readonly searchText = signal('');
  protected readonly options = signal<LookupValue[]>([]);
  protected readonly isOpen = signal(false);
  protected readonly isLoading = signal(false);
  protected readonly activeIndex = signal(-1);
  protected readonly errorMessage = signal('');

  private _searchTimer: ReturnType<typeof setTimeout> | undefined;
  private _searchVersion = 0;

  constructor(private readonly _dataService: BulkChangeDataService) {}

  public ngOnDestroy(): void {
    clearTimeout(this._searchTimer);
  }

  protected optionId(index: number): string {
    return `${this.listboxId}-option-${index}`;
  }

  protected onInput(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.searchText.set(text);
    if (this.selected()) {
      this.selected.set(null);
      this.selectedValueChange.emit(null);
    }
    this._scheduleSearch(text);
  }

  protected onFocus(): void {
    if (!this.isOpen()) {
      this._scheduleSearch(this.selected() ? '' : this.searchText(), 0);
    }
  }

  protected onBlur(): void {
    // Delay so a click on an option is handled before the popup closes.
    setTimeout(() => {
      this.close();
      if (!this.selected()) {
        this.searchText.set('');
      }
    }, 150);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.options().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.isOpen()) {
          this._scheduleSearch(this.searchText(), 0);
          return;
        }
        this.activeIndex.set(count ? (this.activeIndex() + 1) % count : -1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.activeIndex.set(count ? (this.activeIndex() - 1 + count) % count : -1);
        break;
      case 'Enter':
        if (this.isOpen() && this.activeIndex() >= 0) {
          event.preventDefault();
          this.select(this.options()[this.activeIndex()]);
        }
        break;
      case 'Escape':
        if (this.isOpen()) {
          event.preventDefault();
          event.stopPropagation();
          this.close();
        }
        break;
    }
  }

  protected select(option: LookupValue): void {
    this.selected.set(option);
    this.searchText.set(option.displayValue);
    this.selectedValueChange.emit(option);
    this.close();
  }

  protected close(): void {
    this.isOpen.set(false);
    this.activeIndex.set(-1);
  }

  private _scheduleSearch(text: string, delay = SEARCH_DEBOUNCE_MS): void {
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => void this._search(text), delay);
  }

  private async _search(text: string): Promise<void> {
    const version = ++this._searchVersion;
    this.isOpen.set(true);
    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      const options = this.staticOptions
        ? filterOptions(this.staticOptions, text)
        : await this._dataService.searchLookupValues(this.referenceSchemaName, text);
      if (version === this._searchVersion) {
        this.options.set(options);
        this.activeIndex.set(options.length ? 0 : -1);
      }
    } catch (error) {
      if (version === this._searchVersion) {
        this.options.set([]);
        this.errorMessage.set(getErrorMessage(error));
      }
    } finally {
      if (version === this._searchVersion) {
        this.isLoading.set(false);
      }
    }
  }
}

function filterOptions(options: LookupValue[], text: string): LookupValue[] {
  const query = text.trim().toLowerCase();
  return query ? options.filter((option) => option.displayValue.toLowerCase().includes(query)) : [...options];
}