import { SysValuesService } from '@creatio-devkit/common';

/**
 * UI strings of the bulk change component and its properties panel.
 * `{name}` placeholders are replaced by {@link format}.
 */
const EN = {
  buttonCaption: 'Bulk change',
  noSelectionHint: 'Select records in the list to change them',
  selectedCountLabel: 'Selected records: {count}',
  dialogTitle: 'Bulk change',
  recordsToChange: 'Records to change: {count}',
  countingRecords: 'Counting records…',
  fieldLabel: 'Field',
  fieldPlaceholder: 'Select a field',
  valueLabel: 'New value',
  clearValue: 'Clear value',
  requiredCannotBeCleared: 'The field is required and cannot be cleared',
  lookupPlaceholder: 'Start typing to search',
  lookupNoResults: 'Nothing found',
  lookupLoading: 'Loading…',
  booleanTrue: 'Yes',
  booleanFalse: 'No',
  apply: 'Apply',
  cancel: 'Cancel',
  close: 'Close',
  confirmTitle: 'Confirm bulk change',
  confirmCountLabel: 'Records to change',
  confirmFieldLabel: 'Field',
  confirmValueLabel: 'New value',
  confirmNote: 'The change cannot be undone automatically. Each record is saved as if edited by hand, so processes set up for changes of this object run for it.',
  confirmYes: 'Change {count}',
  emptyValue: '(empty)',
  resultUpdated: 'Updated: {count}',
  resultFailed: 'Not updated: {count}',
  resultDone: 'Bulk change completed',
  notifyDone: 'Bulk change completed: {updated} records updated',
  notifyPartial: 'Bulk change completed: {updated} records updated, {failed} not updated',
  errorsTitle: 'Errors',
  noRights: 'You do not have permission to use bulk change',
  notConfigured: 'Bulk change is not linked to a list. Select the list in the designer.',
  noEditableColumns: 'The list has no columns that can be changed. Add the column to the list first.',
  valueRequired: 'Specify a value or select "Clear value"',
  invalidNumber: 'Enter a valid number',
  limitExceeded: 'Too many records selected: {count}. Bulk change supports up to {max} records at once — narrow the filter.',
  loadError: 'Could not load data: {message}',
  listFiltersUnavailable: 'The list did not return its filters. Open the component in the designer to relink it to the list.',
  // properties panel
  panelTitle: 'Bulk change settings',
  panelSectionGeneral: 'General',
  panelSectionAppearance: 'Appearance',
  panelSectionAdvanced: 'Advanced',
  panelInfo: 'More information',
  panelGridLabel: 'List (data source)',
  panelGridNotFound: 'List "{name}" is not found on the page',
  panelGridNotList: 'Element "{name}" is not a list bound to a collection',
  panelNoLists: 'No lists found on the page. Enter the list code below.',
  panelLinkFailed: 'Could not link to the list: {message}',
  panelGridCodeLabel: 'List code',
  panelOtherList: 'Other list (enter the code)…',
  panelGridOption: 'List {entity} | {grid}',
  panelGridHint: 'Selected records of this list are changed. Only columns shown in the list can be changed.',
  panelElementCodeLabel: 'Element code',
  panelElementCodeHint: 'Unique code of the element on the page. It is set when the element is added and cannot be changed.',
  panelVisibleLabel: 'Visible',
  panelVisibleBound: 'Controlled by "{name}" (business rule or binding)',
  panelCaptionLabel: 'Button caption',
} as const;

export type BulkChangeStrings = { [K in keyof typeof EN]: string };

const UK: BulkChangeStrings = {
  buttonCaption: 'Масова зміна',
  noSelectionHint: 'Виберіть записи у списку, щоб змінити їх',
  selectedCountLabel: 'Обрано записів: {count}',
  dialogTitle: 'Масова зміна',
  recordsToChange: 'Буде змінено записів: {count}',
  countingRecords: 'Підрахунок записів…',
  fieldLabel: 'Поле',
  fieldPlaceholder: 'Оберіть поле',
  valueLabel: 'Нове значення',
  clearValue: 'Очистити значення',
  requiredCannotBeCleared: 'Поле обовʼязкове, його не можна очистити',
  lookupPlaceholder: 'Почніть вводити для пошуку',
  lookupNoResults: 'Нічого не знайдено',
  lookupLoading: 'Завантаження…',
  booleanTrue: 'Так',
  booleanFalse: 'Ні',
  apply: 'Застосувати',
  cancel: 'Скасувати',
  close: 'Закрити',
  confirmTitle: 'Підтвердження масової зміни',
  confirmCountLabel: 'Записів до зміни',
  confirmFieldLabel: 'Поле',
  confirmValueLabel: 'Нове значення',
  confirmNote: 'Автоматично скасувати зміну не можна. Кожен запис зберігається так само, як при ручному редагуванні, тож налаштовані на зміну цього обʼєкта процеси для нього спрацюють.',
  confirmYes: 'Змінити {count}',
  emptyValue: '(порожньо)',
  resultUpdated: 'Оновлено: {count}',
  resultFailed: 'Не оновлено: {count}',
  resultDone: 'Масову зміну завершено',
  notifyDone: 'Масову зміну завершено, оновлено записів: {updated}',
  notifyPartial: 'Масову зміну завершено: оновлено {updated}, не оновлено {failed}',
  errorsTitle: 'Помилки',
  noRights: 'Немає прав на використання масової зміни',
  notConfigured: 'Масова зміна не привʼязана до списку. Оберіть список у дизайнері.',
  noEditableColumns: 'У списку немає колонок, які можна змінити. Спершу додайте колонку до списку.',
  valueRequired: 'Вкажіть значення або оберіть «Очистити значення»',
  invalidNumber: 'Введіть коректне число',
  limitExceeded: 'Обрано забагато записів: {count}. За один раз можна змінити не більше {max} — звузьте фільтр.',
  loadError: 'Не вдалося завантажити дані: {message}',
  listFiltersUnavailable: 'Список не повернув свої фільтри. Відкрийте компонент у дизайнері, щоб перепривʼязати його до списку.',
  panelTitle: 'Налаштування масової зміни',
  panelSectionGeneral: 'Загальні',
  panelSectionAppearance: 'Вигляд',
  panelSectionAdvanced: 'Додатково',
  panelInfo: 'Докладніше',
  panelGridLabel: 'Список (джерело даних)',
  panelGridNotFound: 'Список «{name}» не знайдено на сторінці',
  panelGridNotList: 'Елемент «{name}» не є списком, привʼязаним до колекції',
  panelNoLists: 'Списки на сторінці не знайдено. Вкажіть код списку нижче.',
  panelLinkFailed: 'Не вдалося привʼязати до списку: {message}',
  panelGridCodeLabel: 'Код списку',
  panelOtherList: 'Інший список (ввести код)…',
  panelGridOption: 'Список {entity} | {grid}',
  panelGridHint: 'Змінюються виділені записи цього списку. Змінити можна лише колонки, показані в списку.',
  panelElementCodeLabel: 'Код елемента',
  panelElementCodeHint: 'Унікальний код елемента на сторінці. Задається під час додавання елемента і не змінюється.',
  panelVisibleLabel: 'Видимий',
  panelVisibleBound: 'Керується «{name}» (бізнес-правило або привʼязка)',
  panelCaptionLabel: 'Підпис кнопки',
};

const DICTIONARIES: Record<string, BulkChangeStrings> = { en: EN, uk: UK };

let cultureNamePromise: Promise<string> | undefined;

/**
 * Returns the current user's culture name (for example `uk-UA`), falling back to the document language.
 */
export function getUserCultureName(): Promise<string> {
  if (!cultureNamePromise) {
    cultureNamePromise = new SysValuesService()
      .loadSysValues()
      .then((values) => values?.userCulture?.displayValue || document.documentElement.lang || 'en-US')
      .catch(() => document.documentElement.lang || 'en-US');
  }
  return cultureNamePromise;
}

/**
 * Picks the dictionary for a culture name; unknown cultures get English.
 */
export function getStrings(cultureName: string | null | undefined): BulkChangeStrings {
  const language = (cultureName ?? '').split('-')[0].toLowerCase();
  return DICTIONARIES[language] ?? EN;
}

export const DEFAULT_STRINGS: BulkChangeStrings = EN;

/**
 * Replaces `{name}` placeholders with values.
 */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
