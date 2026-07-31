import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Header from './Header';
import { useAuth } from '../context/AuthContext';

// The hook rather than the context, which the module keeps to itself — a
// component should not have to export its internals to be testable.
jest.mock('../context/AuthContext');

const renderAt = (path, admin) => {
  useAuth.mockReturnValue({ admin, signIn: jest.fn(), signOut: jest.fn() });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Header />
    </MemoryRouter>
  );
};

const ADMIN = { id: '1', name: 'Timoteo Sumalinog', email: 't@example.com', role: 'admin' };

test('a signed-in admin on the public side is offered the way back', () => {
  // Following the title link home used to leave an admin with no route to the
  // dashboard except retyping the URL.
  renderAt('/', ADMIN);

  const link = screen.getByRole('link', { name: /dashboard/i });
  expect(link).toHaveAttribute('href', '/admin/dashboard');
});

test('it is offered on every public page, not only the landing page', () => {
  renderAt('/confirmation-code', ADMIN);
  expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
});

test('it is not offered inside the admin area, where it would point at itself', () => {
  renderAt('/admin/dashboard', ADMIN);
  expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument();
});

test('signed out, there is no dashboard link at all — only a way to sign in', () => {
  renderAt('/', null);

  expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /admin login/i })).toBeInTheDocument();
});

test('sign out is still there beside it', () => {
  renderAt('/', ADMIN);
  expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
});

test('the lobby screen offers no way into the admin area', () => {
  // Anyone can walk up to /front-desk. A signed-in receptionist must not leave
  // a Dashboard link there, and a signed-out one must not be shown Admin Login.
  renderAt('/front-desk', ADMIN);
  expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();

  renderAt('/front-desk', null);
  expect(screen.queryByRole('link', { name: /admin login/i })).not.toBeInTheDocument();
});

test('the lobby screen still says whose building this is', () => {
  renderAt('/front-desk', null);
  expect(screen.getByText(/MQD Desk Reservation Systems Office/)).toBeInTheDocument();
  // ...but the title is not a link, so it cannot be used to browse away.
  expect(screen.queryByRole('link', { name: /home/i })).not.toBeInTheDocument();
});
