// What to call a desk or a conference room on a page.
//
// The map shows a token — "4", "511A" — because a marker is a diagram element.
// Everywhere else names the space in a sentence, and there it gets its full
// name: "Desk# 4", "Conference Room 511A".
//
// This exists because nineteen places across the interface were building
// `Desk# ${deskNumber}` inline. That was correct while every bookable thing was
// a desk, and became wrong the moment one of them was a room: "Desk# 13" is an
// internal key nobody reads off a door. One function means the next resource
// type is one change, not another nineteen.
//
// The fallback is deliberate. An endpoint that does not yet send `deskLabel`
// renders exactly what it rendered before, so this can be adopted screen by
// screen without a flag day.
export function resourceLabel(source, { fallback = '—' } = {}) {
  if (!source) return fallback;

  // Already a name.
  if (typeof source === 'string') return source;

  const label = source.deskLabel ?? source.label;
  if (label) return label;

  const number = source.deskNumber ?? source.number;
  return number != null ? `Desk# ${number}` : fallback;
}

export default resourceLabel;
