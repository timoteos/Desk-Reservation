// Who the seed puts in the database, and it is deliberately two lists.
//
// The local fixtures mirror the frontend mocks and carry real colleagues'
// names on real dhs.hawaii.gov addresses. That is fine on a laptop and wrong
// anywhere reachable: this app publishes which days each person is physically
// in the office, so a public demo seeded with those would put State of Hawaii
// staff names, work addresses and attendance patterns on an indexable URL.
//
// The demo list is invented. example.com is reserved by RFC 2606 and can never
// route mail, so nothing here can reach a real inbox even by accident.

const LOCAL = {
  domain: 'dhs.hawaii.gov',
  admin: 'Timoteo Sumalinog',
  emailOverrides: { 'Timoteo Sumalinog': 'tsumalinog-int@dhs.hawaii.gov' },
  people: [
    ['Angello', 'Portillo'], ['Keanu', 'Ishihara'], ['Timoteo', 'Sumalinog'],
    ['Michael', 'Barbieto'], ['Penny', 'Kabua'], ['Mark', 'Burgess'],
    ['Rafael', 'Abitz'], ['Megan', 'Yamamoto'], ['Steve', 'Elias'],
    ['Cacie', 'Sonomura'], ['Travis', 'Quensenberry'], ['Keith', 'Bangi'],
    ['Phan', 'Sirivattha'], ['Rhona', 'Ramos'], ['Michael', 'Mau'],
    ['Marivic', 'Baitalon'],
  ],
  reservations: [
    { name: 'Keanu Ishihara',   deskNumber: 1, dayOffset: 0, startMin: 600, endMin: 690 },
    { name: 'Penny Kabua',      deskNumber: 2, dayOffset: 1, startMin: 540, endMin: 600 },
    { name: 'Megan Yamamoto',   deskNumber: 3, dayOffset: 1, startMin: 780, endMin: 900 },
    { name: 'Angello Portillo', deskNumber: 4, dayOffset: 2, startMin: 480, endMin: 720 },
    { name: 'Rafael Abitz',     deskNumber: 5, dayOffset: 2, startMin: 810, endMin: 990 },
  ],
};

const DEMO = {
  domain: 'example.com',
  admin: 'Dana Reyes',
  emailOverrides: {},
  people: [
    ['Dana', 'Reyes'], ['Sam', 'Okonkwo'], ['Priya', 'Raman'],
    ['Jordan', 'Blake'], ['Mei', 'Tanaka'], ['Alex', 'Moreau'],
    ['Nina', 'Halvorsen'], ['Omar', 'Haddad'], ['Ruth', 'Delacroix'],
    ['Ivan', 'Petrov'], ['Grace', 'Adeyemi'], ['Leo', 'Castellanos'],
    ['Hana', 'Kowalski'], ['Tom', 'Whitfield'], ['Ada', 'Nwosu'],
    ['Ben', 'Sorensen'],
  ],
  reservations: [
    { name: 'Sam Okonkwo',    deskNumber: 1, dayOffset: 0, startMin: 600, endMin: 690 },
    { name: 'Priya Raman',    deskNumber: 2, dayOffset: 1, startMin: 540, endMin: 600 },
    { name: 'Mei Tanaka',     deskNumber: 3, dayOffset: 1, startMin: 780, endMin: 900 },
    { name: 'Jordan Blake',   deskNumber: 4, dayOffset: 2, startMin: 480, endMin: 720 },
    { name: 'Omar Haddad',    deskNumber: 5, dayOffset: 2, startMin: 810, endMin: 990 },
  ],
};

const datasetFor = (mode) => (mode === 'demo' ? DEMO : LOCAL);

const emailFor = (dataset, first, last) =>
  dataset.emailOverrides[`${first} ${last}`] ||
  `${first.toLowerCase()}.${last.toLowerCase()}@${dataset.domain}`;

module.exports = { LOCAL, DEMO, datasetFor, emailFor };
