import { LookupValue } from '@creatio-devkit/common';

import { BulkChangeValue, ValueEditorKind } from './bulk-change.models';

/**
 * Raw editor state: native inputs give strings, the lookup combobox gives a lookup value.
 */
export type EditorRawValue = string | LookupValue | null;

export type ParseResult = { ok: true; value: BulkChangeValue } | { ok: false; error: 'valueRequired' | 'invalidNumber' };

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Converts the raw editor value to the value saved to the column.
 * Dates are created in the user's local time zone, the same way Freedom UI date editors do.
 */
export function parseEditorValue(kind: ValueEditorKind, raw: EditorRawValue): ParseResult {
  if (kind === ValueEditorKind.Lookup) {
    return raw && typeof raw === 'object' ? { ok: true, value: raw } : { ok: false, error: 'valueRequired' };
  }
  const text = typeof raw === 'string' ? raw : '';
  if (kind === ValueEditorKind.Text || kind === ValueEditorKind.LongText) {
    return text.trim() ? { ok: true, value: text } : { ok: false, error: 'valueRequired' };
  }
  if (!text.trim()) {
    return { ok: false, error: 'valueRequired' };
  }
  switch (kind) {
    case ValueEditorKind.Integer: {
      const value = Number(text);
      return Number.isInteger(value) ? { ok: true, value } : { ok: false, error: 'invalidNumber' };
    }
    case ValueEditorKind.Decimal: {
      const value = Number(text.replace(',', '.'));
      return Number.isFinite(value) ? { ok: true, value } : { ok: false, error: 'invalidNumber' };
    }
    case ValueEditorKind.Boolean:
      return { ok: true, value: text === 'true' };
    case ValueEditorKind.Date: {
      const [year, month, day] = text.split('-').map(Number);
      return { ok: true, value: new Date(year, month - 1, day) };
    }
    case ValueEditorKind.DateTime:
      return { ok: true, value: new Date(text) };
    case ValueEditorKind.Time: {
      const [hours, minutes] = text.split(':').map(Number);
      const value = new Date();
      value.setHours(hours, minutes, 0, 0);
      return { ok: true, value };
    }
    default:
      return { ok: false, error: 'valueRequired' };
  }
}

/**
 * Human-readable value for the confirmation message.
 */
export function formatValue(value: BulkChangeValue, kind: ValueEditorKind, strings: { booleanTrue: string; booleanFalse: string }): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    const date = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    const time = `${pad(value.getHours())}:${pad(value.getMinutes())}`;
    if (kind === ValueEditorKind.Date) {
      return value.toLocaleDateString();
    }
    if (kind === ValueEditorKind.Time) {
      return time;
    }
    return value.toLocaleString() || `${date} ${time}`;
  }
  if (typeof value === 'boolean') {
    return value ? strings.booleanTrue : strings.booleanFalse;
  }
  if (typeof value === 'object') {
    return (value as LookupValue).displayValue;
  }
  return String(value);
}
