const {
  RESOURCE_TYPES,
  assertResourceType,
  assertListableType,
  bookingRoleError,
  resourceTypeFromRequest,
  listableTypeFromRequest,
  nounFor,
  labelFor,
  listResources,
  findAvailableResource,
  bookableResourceError,
  resourceByNumber,
} = require('./resources');

// The point of this module is that a forgotten resource type is a failure
// rather than a silent 'desk'. These tests exist to keep it that way: if
// somebody later adds a default to make a call site convenient, the whole file
// goes red.
//
// No database is needed — the guard runs before any query is built, which is
// itself the property being asserted.

describe('assertResourceType', () => {
  it('accepts the types that exist', () => {
    for (const type of RESOURCE_TYPES) {
      expect(assertResourceType(type)).toBe(type);
    }
  });

  it.each([
    ['nothing at all', undefined],
    ['null', null],
    ['an empty string', ''],
    ['a type that does not exist', 'parking'],
    ['a near miss', 'desks'],
    ['the wrong case', 'Desk'],
    ['a number', 1],
  ])('refuses %s', (_label, value) => {
    expect(() => assertResourceType(value)).toThrow(TypeError);
  });

  it('names the offending value, so the message is actionable', () => {
    expect(() => assertResourceType('parking')).toThrow(/"parking"/);
  });
});

describe('every query helper refuses to run without a type', () => {
  // Each of these would otherwise reach the database. The rejection proves the
  // guard is in front of the query, not beside it.
  it.each([
    ['listResources', () => listResources()],
    ['findAvailableResource', () => findAvailableResource(undefined, new Date(), new Date())],
    ['bookableResourceError', () => bookableResourceError(undefined, 1)],
    ['resourceByNumber', () => resourceByNumber(undefined, 3)],
  ])('%s', async (_name, call) => {
    await expect(call()).rejects.toThrow(TypeError);
  });
});

describe('labelFor', () => {
  it('names a desk by its number', () => {
    expect(labelFor({ desk_number: 7, display_name: null })).toBe('Desk# 7');
  });

  it('names a room by its name', () => {
    expect(labelFor({ desk_number: 13, display_name: 'Ocean Room' })).toBe('Ocean Room');
  });

  // The rooms carry desk numbers so the existing routes keep working, which is
  // exactly why the number must never surface for one.
  it('never shows a room its desk number', () => {
    expect(labelFor({ desk_number: 14, display_name: 'Hilo Room' })).not.toMatch(/14/);
  });
});

describe('who may book what', () => {
  it('lets staff and admins book a conference room', () => {
    expect(bookingRoleError('room', 'member')).toBeNull();
    expect(bookingRoleError('room', 'admin')).toBeNull();
  });

  // The rule the PM asked for: external visitors do not book rooms. They can be
  // in the meeting — the room is booked by the person they came to see.
  it('refuses a conference room to an external visitor', () => {
    expect(bookingRoleError('room', 'guest')).toMatch(/MQD staff/);
  });

  // Guests holding desks is the existing sponsorship feature, and this rule
  // must not quietly take it away.
  it('still lets a visitor hold a desk', () => {
    expect(bookingRoleError('desk', 'guest')).toBeNull();
    expect(bookingRoleError('desk', 'member')).toBeNull();
    expect(bookingRoleError('desk', 'admin')).toBeNull();
  });

  // An unknown role is refused rather than allowed through. If SSO ever
  // introduces a role nobody listed here, a room booking fails closed.
  it.each([undefined, null, '', 'contractor', 'Admin'])('refuses the unknown role %p', (role) => {
    expect(bookingRoleError('room', role)).not.toBeNull();
    expect(bookingRoleError('desk', role)).not.toBeNull();
  });

  it('is guarded on the resource type like everything else', () => {
    expect(() => bookingRoleError(undefined, 'admin')).toThrow(TypeError);
  });
});

describe('resourceTypeFromRequest', () => {
  // The one place a default is allowed to live, so a caller written before
  // rooms existed keeps booking desks.
  it('defaults to a desk when nothing was asked for', () => {
    expect(resourceTypeFromRequest(undefined)).toBe('desk');
    expect(resourceTypeFromRequest(null)).toBe('desk');
  });

  it('passes through a type that exists', () => {
    expect(resourceTypeFromRequest('room')).toBe('room');
    expect(resourceTypeFromRequest('desk')).toBe('desk');
  });

  // Null rather than a silent fallback: somebody who asked for parking must not
  // be quietly given a desk.
  it.each(['parking', 'Room', '', 'rooms', 1])('refuses %p', (value) => {
    expect(resourceTypeFromRequest(value)).toBeNull();
  });
});

// The map shows one office, so listing accepts 'all'. Assigning one cannot:
// "book me anything free" has to land on a desk or a room, never a coin toss
// between a hot desk and a ten-seat conference room.
describe("'all' is a way of looking, never a way of booking", () => {
  it('is listable', () => {
    expect(listableTypeFromRequest('all')).toBe('all');
    expect(() => assertListableType('all')).not.toThrow();
  });

  it('is refused by every booking path', () => {
    expect(resourceTypeFromRequest('all')).toBeNull();
    expect(() => assertResourceType('all')).toThrow(TypeError);
  });

  it('cannot be auto-assigned from, even by a direct call', async () => {
    await expect(findAvailableResource('all', new Date(), new Date()))
      .rejects.toThrow(TypeError);
  });

  it('cannot decide who may book', () => {
    expect(() => bookingRoleError('all', 'admin')).toThrow(TypeError);
  });

  it('still refuses a type that does not exist', () => {
    expect(listableTypeFromRequest('parking')).toBeNull();
    expect(() => assertListableType('everything')).toThrow(TypeError);
  });
});

describe('nounFor', () => {
  it('calls a room a conference room, so refusals do not read as desk faults', () => {
    expect(nounFor('room')).toBe('conference room');
    expect(nounFor('desk')).toBe('desk');
  });

  it('is guarded like everything else', () => {
    expect(() => nounFor('parking')).toThrow(TypeError);
  });
});
