const fs = require('fs');
const path = require('path');

// A conference room shown as "Desk# 13" was not one mistake, it was six: every
// screen rebuilt a name from a number, and the routes that had the name did not
// send it. The name now travels with the number.
//
// This reads the source rather than calling the routes because the failure is
// structural — a query that fetches desk_label and a response that forgets it —
// and that is visible without a database, a server or a session.

const ROUTES = path.join(__dirname);
const LIB = path.join(__dirname, '..', 'lib');

const read = (p) => fs.readFileSync(p, 'utf8');
const sourcesIn = (dir) =>
  fs.readdirSync(dir)
    .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'))
    .map((f) => [path.join(dir, f), read(path.join(dir, f))]);

const ALL = [...sourcesIn(ROUTES), ...sourcesIn(LIB)];

describe('a number never travels without a name', () => {
  // The rule, stated once: any response shape carrying deskNumber must carry
  // the name beside it. A client given only a number can do nothing but rebuild
  // "Desk# " + number, which is how Conference Room 511A came to be called
  // Desk# 13 on six different screens.
  //
  // This originally only checked files that already selected desk_label, which
  // is why five more sites survived the first fix — they never fetched the name
  // at all, so there was nothing to notice missing.
  const offenders = [];
  for (const [file, src] of ALL) {
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      if (!/\bdeskNumber:/.test(line)) return;
      // The enclosing object literal, generously bounded.
      const near = lines.slice(Math.max(0, i - 16), i + 16).join('\n');
      // `label:` covers recurringPattern, whose rows are consumed internally
      // and name the field without the desk prefix.
      if (!/deskLabel|label:/.test(near)) {
        offenders.push(`${path.basename(file)}:${i + 1}`);
      }
    });
  }

  it('has sites to check, so the sweep is not silently empty', () => {
    const emitting = ALL.filter(([, src]) => /\bdeskNumber:/.test(src));
    expect(emitting.length).toBeGreaterThanOrEqual(6);
  });

  it('finds none emitting a bare number', () => {
    expect(offenders).toEqual([]);
  });
});

describe('no stored sentence names a space by number', () => {
  // Log descriptions are written once and read for years. "Booked Desk# 13"
  // stays wrong forever, long after the display is fixed.
  const descriptions = ALL.flatMap(([file, src]) =>
    [...src.matchAll(/description:\s*([^\n]+)/g)].map((m) => [file, m[1]])
  );

  it('finds descriptions to check', () => {
    expect(descriptions.length).toBeGreaterThan(0);
  });

  // The one permitted use is an explicit fallback for a row that genuinely has
  // no name, written as `?? \`Desk# ...\``.
  const hardcoded = descriptions
    .filter(([, line]) => /Desk#/.test(line) && !/\?\?/.test(line))
    .map(([file, line]) => `${path.basename(file)}: ${line.trim()}`);

  it('names no space by number in a sentence it will store', () => {
    expect(hardcoded).toEqual([]);
  });
});
