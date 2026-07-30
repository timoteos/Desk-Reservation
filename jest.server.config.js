// The server has its own jest run because create-react-app pins its roots to
// src/ and will not look outside it. That is why the rules the API actually
// enforces had no tests at all — and why a timezone assumption that made every
// booking for today impossible on a UTC host reached production unnoticed.
//
// Node environment, no jsdom, no CRA transform: these are plain CommonJS
// modules.
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/server'],
  testMatch: ['**/*.test.js'],
};
