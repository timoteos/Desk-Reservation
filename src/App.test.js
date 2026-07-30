import { render, screen } from '@testing-library/react';
import App from './App';

// This was Create React App's boilerplate, asserting on a "learn react" link
// that has never existed in this project. It could not have passed — and until
// the Jest config learned to resolve react-router v7 it never even ran, so it
// failed for a reason that hid the fact that it was also wrong.
//
// It earns its place as a smoke test: the whole route tree mounts without
// throwing. The landing page headline types itself in one character at a time,
// so the banner is what is reliably on screen at first paint.
test('the app mounts and renders the landing page', () => {
  render(<App />);
  expect(
    screen.getByRole('link', { name: /MQD Desk Reservation Systems Office/i })
  ).toBeInTheDocument();
});
