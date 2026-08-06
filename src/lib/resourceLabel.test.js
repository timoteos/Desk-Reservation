import { resourceLabel } from './resourceLabel';

// One function decides what a space is called in prose, because nineteen
// screens used to decide it separately and all nineteen said "Desk# ".

describe('resourceLabel', () => {
  it('prefers the name the API sent', () => {
    expect(resourceLabel({ deskNumber: 13, deskLabel: 'Conference Room 511A' }))
      .toBe('Conference Room 511A');
  });

  // The desks endpoint calls it `label`; reservations call it `deskLabel`.
  it('accepts either field name', () => {
    expect(resourceLabel({ number: 14, label: 'Conference Room 511B' }))
      .toBe('Conference Room 511B');
  });

  // An endpoint not yet sending a name renders exactly what it rendered before,
  // so this could be adopted screen by screen without a flag day.
  it('falls back to the old wording when no name was sent', () => {
    expect(resourceLabel({ deskNumber: 4 })).toBe('Desk# 4');
    expect(resourceLabel({ number: 4 })).toBe('Desk# 4');
  });

  it('passes a plain string straight through', () => {
    expect(resourceLabel('Conference Room 511A')).toBe('Conference Room 511A');
  });

  // Schedules can have no desk assigned yet, and an em dash is what those
  // screens already showed.
  it.each([null, undefined, {}])('gives a dash for %p', (input) => {
    expect(resourceLabel(input)).toBe('—');
  });

  it('takes a caller-supplied fallback', () => {
    expect(resourceLabel(null, { fallback: 'Any free desk' })).toBe('Any free desk');
  });

  // Desk 0 does not exist, but a falsy number must not silently become a dash.
  it('does not treat number 0 as missing', () => {
    expect(resourceLabel({ deskNumber: 0 })).toBe('Desk# 0');
  });
});
