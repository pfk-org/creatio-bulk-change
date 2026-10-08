import { ChangeDetectionStrategy, Component, computed, Input, signal, ViewEncapsulation } from '@angular/core';
import { CrtInput, CrtViewElement, JsonData } from '@creatio-devkit/common';
import {
  InterfaceDesignerSchemaService,
  PropertyPanel,
  ViewNodeEditor,
  ViewNodePropertyValueType,
} from '@creatio/interface-designer';

import { BulkChangeStrings, DEFAULT_STRINGS, format, getStrings, getUserCultureName } from '../../../../shared/i18n';
import { RESOLVE_FILTERS_REQUEST } from '../../../runtime/runtime-feature.ids';
import { BULK_CHANGE_PANEL_SELECTOR, BULK_CHANGE_PANEL_TYPE } from '../../design-feature.ids';
import { buildFiltersExpression, buildCompletedRequest, discoverGridLinks, GridLink } from './grid-link';

/** Value of the dropdown option that switches to entering the list code by hand. */
const OTHER_LIST_OPTION = '';

type PanelSection = 'general' | 'appearance' | 'advanced';

interface GridOption {
  gridName: string;
  caption: string;
}

/**
 * Properties panel of the bulk change component.
 *
 * Offers the lists found on the page and links the component to the chosen one: binds the
 * selection, binds the request that returns the current selection filters, binds the data source
 * reload after the change and copies the entity name and the list columns. The link is refreshed
 * every time the panel opens, so columns added to the list in the designer appear automatically.
 */
@CrtViewElement({
  selector: BULK_CHANGE_PANEL_SELECTOR,
  type: BULK_CHANGE_PANEL_TYPE,
})
@Component({
  selector: 'pfk-bulk-change-panel-internal',
  templateUrl: './bulk-change-panel.component.html',
  styleUrls: ['./bulk-change-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  standalone: false,
})
export class BulkChangePanelComponent implements PropertyPanel {
  protected readonly ids = {
    grid: 'pfk-bulk-change-panel-grid',
    gridCode: 'pfk-bulk-change-panel-grid-code',
    gridStatus: 'pfk-bulk-change-panel-grid-status',
    caption: 'pfk-bulk-change-panel-caption',
    gridListbox: 'pfk-bulk-change-panel-grid-listbox',
    gridOption: 'pfk-bulk-change-panel-grid-option-',
    visibleHint: 'pfk-bulk-change-panel-visible-hint',
    elementCode: 'pfk-bulk-change-panel-element-code',
    section: 'pfk-bulk-change-panel-section-',
    tooltip: 'pfk-bulk-change-panel-tooltip-',
  };

  protected readonly isPanelReady = signal(false);
  protected readonly strings = signal<BulkChangeStrings>(DEFAULT_STRINGS);
  protected readonly gridOptions = signal<GridOption[]>([]);
  protected readonly gridName = signal('');
  /** The list code is entered by hand: no list was found, or the user chose "Other list". */
  protected readonly isManualEntry = signal(false);
  protected readonly OTHER_LIST_OPTION = OTHER_LIST_OPTION;
  protected readonly caption = signal('');
  protected readonly isVisible = signal(true);
  /** Name of the attribute `visible` is bound to (for example by a business rule); empty for a constant. */
  protected readonly visibleBinding = signal('');
  protected readonly linkError = signal('');
  protected readonly elementCode = signal('');

  /** List dropdown, drawn like the out-of-the-box combobox: the found lists and "Other list". */
  protected readonly isListOpen = signal(false);
  protected readonly activeOptionIndex = signal(0);
  protected readonly listOptions = computed<GridOption[]>(() => [
    ...this.gridOptions(),
    { gridName: OTHER_LIST_OPTION, caption: this.strings().panelOtherList },
  ]);
  protected readonly selectedListCaption = computed(() => {
    if (this.isManualEntry()) {
      return this.strings().panelOtherList;
    }
    return this.gridOptions().find((option) => option.gridName === this.gridName())?.caption ?? '';
  });
  private readonly _openSections = signal<ReadonlySet<PanelSection>>(new Set(['general', 'appearance', 'advanced']));

  private readonly _schemaEditor = new InterfaceDesignerSchemaService().getSchemaEditor();
  private readonly _links = new Map<string, GridLink>();
  private _viewNodeEditorInstance: ViewNodeEditor | null = null;

  private get _viewNodeEditor(): ViewNodeEditor {
    if (!this._viewNodeEditorInstance) {
      throw new Error('View node editor is not initialized');
    }
    return this._viewNodeEditorInstance;
  }

  @Input()
  @CrtInput()
  public set viewNodeEditor(nodeEditor: ViewNodeEditor) {
    this._viewNodeEditorInstance = nodeEditor;
    this._init().catch((error) => console.error('[PfkBulkChange] Panel initialization failed', error));
  }

  protected toggleList(): void {
    if (this.isListOpen()) {
      this.closeList();
    } else {
      this._openList();
    }
  }

  protected closeList(): void {
    this.isListOpen.set(false);
  }

  protected isOptionSelected(option: GridOption): boolean {
    return option.gridName === OTHER_LIST_OPTION ? this.isManualEntry() : !this.isManualEntry() && option.gridName === this.gridName();
  }

  /**
   * Keyboard of the list dropdown (ARIA combobox): arrows and Home/End move, Enter/Space choose, Escape closes.
   */
  protected onListKeydown(event: KeyboardEvent): void {
    const count = this.listOptions().length;
    const move = (index: number): void => {
      event.preventDefault();
      if (!this.isListOpen()) {
        this._openList();
        return;
      }
      this.activeOptionIndex.set((index + count) % count);
    };
    switch (event.key) {
      case 'ArrowDown':
        move(this.activeOptionIndex() + 1);
        break;
      case 'ArrowUp':
        move(this.activeOptionIndex() - 1);
        break;
      case 'Home':
        move(0);
        break;
      case 'End':
        move(count - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (this.isListOpen()) {
          void this.chooseList(this.listOptions()[this.activeOptionIndex()]);
        } else {
          this._openList();
        }
        break;
      case 'Escape':
        if (this.isListOpen()) {
          event.preventDefault();
          this.closeList();
        }
        break;
      case 'Tab':
        this.closeList();
        break;
    }
  }

  /** Closes the dropdown when the focus leaves it. */
  protected onListFocusOut(event: FocusEvent): void {
    const combobox = (event.currentTarget as HTMLElement | null) ?? null;
    if (!combobox?.contains(event.relatedTarget as Node | null)) {
      this.closeList();
    }
  }

  protected async chooseList(option: GridOption | undefined): Promise<void> {
    this.closeList();
    if (!option) {
      return;
    }
    await this._selectGrid(option.gridName);
  }

  private _openList(): void {
    const selectedIndex = this.listOptions().findIndex((option) => this.isOptionSelected(option));
    this.activeOptionIndex.set(Math.max(selectedIndex, 0));
    this.isListOpen.set(true);
  }

  private async _selectGrid(value: string): Promise<void> {
    if (value === OTHER_LIST_OPTION) {
      this.isManualEntry.set(true);
      setTimeout(() => document.getElementById(this.ids.gridCode)?.focus());
      return;
    }
    this.isManualEntry.set(false);
    this.gridName.set(value);
    await this._applyLink();
  }

  protected async onCaptionInput(event: Event): Promise<void> {
    const value = (event.target as HTMLInputElement).value;
    this.caption.set(value);
    await this._viewNodeEditor.setPropertyValue('caption', { constant: value });
  }

  protected async onVisibleChange(event: Event): Promise<void> {
    const value = (event.target as HTMLInputElement).checked;
    this.isVisible.set(value);
    this.visibleBinding.set('');
    await this._viewNodeEditor.setPropertyValue('visible', { constant: value });
  }

  protected isSectionOpen(section: PanelSection): boolean {
    return this._openSections().has(section);
  }

  protected toggleSection(section: PanelSection): void {
    const sections = new Set(this._openSections());
    if (!sections.delete(section)) {
      sections.add(section);
    }
    this._openSections.set(sections);
  }

  protected format(template: string, values: Record<string, string | number>): string {
    return format(template, values);
  }

  protected async onManualGridNameChange(event: Event): Promise<void> {
    const gridName = (event.target as HTMLInputElement).value.trim();
    this.gridName.set(gridName);
    await this._discoverLists(gridName);
    if (this._links.has(gridName)) {
      this.isManualEntry.set(false);
    }
    await this._applyLink();
  }

  /**
   * The panel is shown right away; every step that reads the schema is guarded, so one unexpected
   * schema element can never leave the panel empty.
   */
  private async _init(): Promise<void> {
    this.strings.set(getStrings(await getUserCultureName().catch(() => 'en-US')));
    const editor = this._viewNodeEditor;
    this.elementCode.set(editor.nodeName ?? '');
    const savedGridName = (await safely(() => getConstant<string>(editor, 'dataGridName'))) ?? '';
    this.gridName.set(savedGridName);
    this.caption.set((await safely(() => getConstant<string>(editor, 'caption'))) ?? '');
    await safely(() => this._loadVisibility(editor));
    this.isPanelReady.set(true);

    await this._discoverLists(savedGridName);
    if (!this._links.has(this.gridName())) {
      this.gridName.set(this.gridOptions()[0]?.gridName ?? savedGridName);
    }
    await this._applyLink();
  }

  private async _discoverLists(extraGridName: string): Promise<void> {
    const links = (await safely(() => discoverGridLinks(this._schemaEditor, [extraGridName]))) ?? [];
    this._links.clear();
    links.forEach((link) => this._links.set(link.gridName, link));
    const template = this.strings().panelGridOption;
    this.gridOptions.set(
      links.map((link) => ({ gridName: link.gridName, caption: format(template, { entity: link.entitySchemaName, grid: link.gridName }) })),
    );
  }

  private async _loadVisibility(editor: ViewNodeEditor): Promise<void> {
    const visible = await editor.getPropertyValue('visible');
    if (visible?.type === ViewNodePropertyValueType.AttributeBinding) {
      this.visibleBinding.set(visible.attributePath);
      this.isVisible.set(true);
      return;
    }
    this.visibleBinding.set('');
    this.isVisible.set(visible?.type === ViewNodePropertyValueType.Constant ? visible.value !== false : true);
  }

  /**
   * Links the component to the chosen list and writes only the bindings that changed.
   */
  private async _applyLink(): Promise<void> {
    const strings = this.strings();
    this.linkError.set('');
    const gridName = this.gridName();
    const link = this._links.get(gridName);
    if (!link) {
      this.linkError.set(
        this.isManualEntry() && gridName ? format(strings.panelGridNotFound, { name: gridName }) : strings.panelNoLists,
      );
      return;
    }
    try {
      await this._writeLink(link);
    } catch (error) {
      console.error('[PfkBulkChange] Could not link the component to the list', error);
      this.linkError.set(format(strings.panelLinkFailed, { message: error instanceof Error ? error.message : String(error) }));
    }
  }

  private async _writeLink(link: GridLink): Promise<void> {
    const editor = this._viewNodeEditor;
    await setConstantIfChanged(editor, 'dataGridName', link.gridName);
    await setConstantIfChanged(editor, 'entitySchemaName', link.entitySchemaName);
    await setConstantIfChanged(editor, 'dataSourceName', link.dataSourceName);
    await setConstantIfChanged(editor, 'columns', link.columns as unknown as JsonData);
    await bindAttributeIfChanged(editor, 'selectionState', link.selectionStateAttributeName);
    await bindRequestIfChanged(editor, 'filtersRequested', {
      request: RESOLVE_FILTERS_REQUEST,
      params: { filters: buildFiltersExpression(link), callback: '@event.detail.resolve' },
    });
    await bindRequestIfChanged(editor, 'bulkChangeCompleted', buildCompletedRequest(link));
  }
}

/**
 * Runs a schema read and logs instead of throwing, so the panel stays usable.
 */
async function safely<T>(action: () => Promise<T>): Promise<T | undefined> {
  try {
    return await action();
  } catch (error) {
    console.error('[PfkBulkChange] Properties panel step failed', error);
    return undefined;
  }
}

async function getConstant<T>(editor: ViewNodeEditor, propertyName: string): Promise<T | undefined> {
  const value = await editor.getPropertyValue(propertyName);
  return value?.type === ViewNodePropertyValueType.Constant ? (value.value as T) : undefined;
}

/**
 * Comparing before writing keeps the page unchanged when the panel only re-reads the same list.
 * Never write `null` to an output (event) property: the designer reads `.request` from it and fails.
 */
async function setConstantIfChanged(editor: ViewNodeEditor, propertyName: string, value: JsonData): Promise<void> {
  const current = await editor.getPropertyValue(propertyName);
  if (current?.type === ViewNodePropertyValueType.Constant && JSON.stringify(current.value) === JSON.stringify(value)) {
    return;
  }
  await editor.setPropertyValue(propertyName, { constant: value });
}

async function bindAttributeIfChanged(editor: ViewNodeEditor, propertyName: string, attributeName: string): Promise<void> {
  const current = await editor.getPropertyValue(propertyName);
  if (current?.type === ViewNodePropertyValueType.AttributeBinding && current.attributePath === attributeName) {
    return;
  }
  await editor.setPropertyValue(propertyName, { bindToAttribute: attributeName });
}

async function bindRequestIfChanged(
  editor: ViewNodeEditor,
  propertyName: string,
  binding: { request: string; params: Record<string, JsonData> },
): Promise<void> {
  const current = await editor.getPropertyValue(propertyName);
  if (
    current?.type === ViewNodePropertyValueType.RequestBinding &&
    current.requestType === binding.request &&
    JSON.stringify(current.params ?? {}) === JSON.stringify(binding.params)
  ) {
    return;
  }
  await editor.setPropertyValue(propertyName, { bindToRequest: binding });
}

