import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminBookingModal from './AdminBookingModal';
import * as api from '../api/client';

jest.mock('../api/client');

const nextTuesday = () => {
  const d = new Date();
  d.setDate(d.getDate() + ((2 - d.getDay() + 7) % 7 || 7) + 7);
  return d.toISOString().slice(0, 10);
};

beforeEach(() => {
  jest.clearAllMocks();
  api.getDesks.mockResolvedValue([{ id: 2, number: 2 }]);
  api.getReservationsForDate.mockResolvedValue([]);
  api.adminBook.mockResolvedValue({
    id: '1', confirmationCode: 'GUEST001', deskNumber: 2, status: 'approved', external: true,
  });
});

const USERS = [{ id: '5', name: 'Penny Kabua' }];

const open = () =>
  render(<AdminBookingModal users={USERS} onClose={() => {}} onBooked={() => {}} />);

const fillVisitor = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /external visitor/i }));
  fireEvent.change(screen.getByLabelText(/visitor first name/i), { target: { value: 'Ana' } });
  fireEvent.change(screen.getByLabelText(/visitor last name/i), { target: { value: 'Cruz' } });
  fireEvent.change(screen.getByLabelText(/visitor email/i), { target: { value: 'ana@acme.test' } });
  fireEvent.change(screen.getByLabelText(/^date$/i), { target: { value: nextTuesday() } });
};

test('a visitor cannot be booked until the sponsor accepts responsibility', async () => {
  // The stored sponsor is what carries accountability, but the admin should not
  // be able to say they did not know they were taking it on.
  open();
  await fillVisitor();

  expect(screen.getByRole('button', { name: /^book (desk#|any free desk)/i })).toBeDisabled();

  fireEvent.click(screen.getByRole('checkbox'));
  expect(screen.getByRole('button', { name: /^book (desk#|any free desk)/i })).toBeEnabled();
});

test('the sponsor is never sent from the browser', async () => {
  open();
  await fillVisitor();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /^book (desk#|any free desk)/i }));

  await waitFor(() => expect(api.adminBook).toHaveBeenCalled());
  const sent = api.adminBook.mock.calls[0][0];

  // Who is responsible is taken from the token server side. A sponsor named by
  // the client would be worth nothing as a record.
  expect(sent).not.toHaveProperty('sponsoredBy');
  expect(sent).not.toHaveProperty('sponsorId');
  expect(sent.guest).toMatchObject({ firstName: 'Ana', lastName: 'Cruz', email: 'ana@acme.test' });
  expect(sent).not.toHaveProperty('userId');
});

test('booking a staff member sends no guest and needs no acceptance', async () => {
  open();
  await screen.findByRole('button', { name: /a staff member/i });

  fireEvent.change(screen.getByLabelText(/staff member/i), { target: { value: '5' } });
  fireEvent.change(screen.getByLabelText(/^date$/i), { target: { value: nextTuesday() } });

  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^book (desk#|any free desk)/i }));

  await waitFor(() => expect(api.adminBook).toHaveBeenCalled());
  expect(api.adminBook.mock.calls[0][0]).not.toHaveProperty('guest');
});

test('the responsibility notice names what is being taken on', async () => {
  open();
  fireEvent.click(await screen.findByRole('button', { name: /external visitor/i }));

  expect(screen.getByText(/you are sponsoring this visitor/i)).toBeInTheDocument();
  expect(screen.getByText(/accountable/i)).toBeInTheDocument();
});

test('a visitor whose details are half-filled cannot be booked', async () => {
  // The acceptance box is not the only gate — an admin who ticks it before
  // filling the form should still not be able to submit a nameless visitor.
  open();
  fireEvent.click(await screen.findByRole('button', { name: /external visitor/i }));
  fireEvent.change(screen.getByLabelText(/visitor first name/i), { target: { value: 'Ana' } });
  fireEvent.click(screen.getByRole('checkbox'));

  expect(screen.getByRole('button', { name: /^book (desk#|any free desk)/i })).toBeDisabled();
});
