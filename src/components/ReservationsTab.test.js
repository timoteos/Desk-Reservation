import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReservationsTab from './ReservationsTab';
import * as api from '../api/client';

jest.mock('../api/client');

const scheduleDay = (id, date) => ({
  id: String(id),
  date,
  startMin: 450,
  endMin: 1020,
  status: 'approved',
  confirmationCode: `CODE${id}`,
  bookingSource: 'recurring',
  scheduleId: '6',
  seriesId: '6',
  user: 'Timoteo Sumalinog',
  userId: 3,
  deskNumber: 1,
  deskId: 1,
});

const ONE_OFF = {
  id: '99',
  date: '2027-08-06',
  startMin: 540,
  endMin: 720,
  status: 'approved',
  confirmationCode: 'ONEOFF01',
  bookingSource: 'user',
  scheduleId: null,
  seriesId: null,
  user: 'Penny Kabua',
  userId: 5,
  deskNumber: 7,
  deskId: 7,
};

const ROWS = [
  scheduleDay(1, '2027-08-03'),
  scheduleDay(2, '2027-08-04'),
  scheduleDay(3, '2027-08-05'),
  ONE_OFF,
];

beforeEach(() => {
  jest.clearAllMocks();
  api.getAllReservations.mockResolvedValue(ROWS);
});

test('schedule days are not listed here at all', async () => {
  render(<ReservationsTab />);

  await screen.findByText('Penny Kabua');
  // Not folded, not collapsed — absent. The arrangement lives on the Schedules
  // tab and this tab does not restate it.
  expect(screen.queryByText('Timoteo Sumalinog')).not.toBeInTheDocument();
  expect(screen.queryByText(/Show all/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /manage this schedule/i })).not.toBeInTheDocument();
});

test('the count says one-off, so it is not read as office usage', async () => {
  render(<ReservationsTab />);

  await screen.findByText('Penny Kabua');
  // Three of the four rows were schedule days. A bare "1 booking" would say the
  // office is nearly empty.
  expect(screen.getByText(/one-off booking/)).toBeInTheDocument();
  expect(screen.getByText(/Recurring schedules\s+are on the Schedules tab/)).toBeInTheDocument();
});

test('an empty result explains where the schedules went', async () => {
  api.getAllReservations.mockResolvedValue([scheduleDay(1, '2027-08-03')]);
  render(<ReservationsTab />);

  await screen.findByText(/No upcoming one-off bookings/);
  expect(
    screen.getByText(/Recurring schedules and the days they hold are on the Schedules tab/)
  ).toBeInTheDocument();
});

test('a one-off booking can still be cancelled and edited', async () => {
  api.adminCancelReservation.mockResolvedValue({ status: 'canceled' });
  render(<ReservationsTab />);

  await screen.findByText('Penny Kabua');
  fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
  fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

  await waitFor(() => expect(api.adminCancelReservation).toHaveBeenCalledWith('99'));
});

test('searching never turns up a schedule day', async () => {
  render(<ReservationsTab />);
  await screen.findByText('Penny Kabua');

  fireEvent.change(screen.getByPlaceholderText(/search/i), {
    target: { value: 'Timoteo' },
  });

  expect(await screen.findByText(/No one-off booking matches that search/)).toBeInTheDocument();
});
