import { ValueEditorKind } from './bulk-change.models';
import { formatValue, parseEditorValue } from './value-utils';

const strings = { booleanTrue: 'Yes', booleanFalse: 'No' };

describe('value-utils', () => {
  describe('parseEditorValue', () => {
    it('requires a value', () => {
      expect(parseEditorValue(ValueEditorKind.Text, '   ')).toEqual({ ok: false, error: 'valueRequired' });
      expect(parseEditorValue(ValueEditorKind.Lookup, null)).toEqual({ ok: false, error: 'valueRequired' });
      expect(parseEditorValue(ValueEditorKind.Date, '')).toEqual({ ok: false, error: 'valueRequired' });
    });

    it('keeps text as typed', () => {
      expect(parseEditorValue(ValueEditorKind.Text, ' New ')).toEqual({ ok: true, value: ' New ' });
    });

    it('parses numbers and rejects invalid ones', () => {
      expect(parseEditorValue(ValueEditorKind.Integer, '42')).toEqual({ ok: true, value: 42 });
      expect(parseEditorValue(ValueEditorKind.Integer, '4.2')).toEqual({ ok: false, error: 'invalidNumber' });
      expect(parseEditorValue(ValueEditorKind.Decimal, '4,5')).toEqual({ ok: true, value: 4.5 });
      expect(parseEditorValue(ValueEditorKind.Decimal, 'abc')).toEqual({ ok: false, error: 'invalidNumber' });
    });

    it('parses booleans', () => {
      expect(parseEditorValue(ValueEditorKind.Boolean, 'false')).toEqual({ ok: true, value: false });
    });

    it('creates dates in the local time zone', () => {
      const result = parseEditorValue(ValueEditorKind.Date, '2026-10-01');
      expect(result.ok && result.value).toEqual(new Date(2026, 9, 1));
    });

    it('returns the lookup value', () => {
      const lookup = { value: 'id-1', displayValue: 'Customer' };
      expect(parseEditorValue(ValueEditorKind.Lookup, lookup)).toEqual({ ok: true, value: lookup });
    });
  });

  describe('formatValue', () => {
    it('formats lookups, booleans and empty values', () => {
      expect(formatValue({ value: 'id', displayValue: 'Partner' }, ValueEditorKind.Lookup, strings)).toBe('Partner');
      expect(formatValue(true, ValueEditorKind.Boolean, strings)).toBe('Yes');
      expect(formatValue(null, ValueEditorKind.Text, strings)).toBe('');
    });

    it('formats time as HH:mm', () => {
      expect(formatValue(new Date(2026, 0, 1, 9, 5), ValueEditorKind.Time, strings)).toBe('09:05');
    });
  });
});
