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

test('the lobby screen names itself as the front desk, not the whole system', () => {
  // Somebody standing at reception wants to know they are at the right desk,
  // not the name of the software.
  renderAt('/front-desk', null);
  expect(screen.getByText('MQD Front Desk')).toBeInTheDocument();
  expect(screen.queryByText(/Desk Reservation Systems Office/)).not.toBeInTheDocument();
  // ...and the title is not a link, so it cannot be used to browse away.
  expect(screen.queryByRole('link', { name: /home/i })).not.toBeInTheDocument();
});

test('every other page keeps the full name', () => {
  renderAt('/', null);
  expect(screen.getByText(/MQD Desk Reservation Systems Office/)).toBeInTheDocument();
});

// The title used to be plain text inside the admin area, because an early
// version of it stranded admins on the public side. The Dashboard button is
// that route back, so the round trip is closed and the title can behave the way
// a title anywhere else does.
describe('the title goes home', () => {
  test('from inside the admin area', () => {
    renderAt('/admin/dashboard', ADMIN);
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/');
  });

  test('from the public side', () => {
    renderAt('/calendar', null);
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/');
  });

  // Clicking home and then back again, which is the whole reason the title was
  // held back before.
  test('and the way back is there when you arrive', () => {
    renderAt('/', ADMIN);
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
  });

  // A heading reading "Admin Dashboard" that navigates away from the dashboard
  // would name the wrong destination.
  test('and says where it goes, not where you are', () => {
    renderAt('/admin/dashboard', ADMIN);
    expect(screen.getByRole('heading', { name: /MQD Desk Reservation Systems Office/i }))
      .toBeInTheDocument();
    expect(screen.queryByText('Admin Dashboard')).not.toBeInTheDocument();
  });

  // The lobby screen keeps plain text: every control that leads anywhere is
  // deliberately absent from a screen anybody can walk up to.
  test('except on the kiosk, where nothing leads anywhere', () => {
    renderAt('/front-desk', ADMIN);
    expect(screen.queryByRole('link', { name: /home/i })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /MQD Front Desk/i })).toBeInTheDocument();
  });
});
