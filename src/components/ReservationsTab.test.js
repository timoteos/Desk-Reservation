import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ReservationsTab from './ReservationsTab';
import * as api from '../api/client';

jest.mock('../api/client');

const occurrence = (id, date) => ({
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

const ROWS = [
  occurrence(1, '2027-08-03'),
  occurrence(2, '2027-08-04'),
  occurrence(3, '2027-08-05'),
  {
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
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  api.getAllReservations.mockResolvedValue(ROWS);
});

test("a schedule's bookings fold into one row rather than three", async () => {
  render(<ReservationsTab />);

  await screen.findByText('Timoteo Sumalinog');
  // One row for the schedule, not one per occurrence.
  expect(screen.getAllByText('Timoteo Sumalinog')).toHaveLength(1);
  expect(screen.getByText(/Show all 3 bookings/)).toBeInTheDocument();
  expect(screen.getByText('Penny Kabua')).toBeInTheDocument();
});

test('the folded row no longer manages the schedule', async () => {
  render(<ReservationsTab />);
  await screen.findByText('Timoteo Sumalinog');

  // All of this belongs to the Schedules tab. Having it here meant two front
  // doors onto ending somebody's arrangement.
  expect(screen.queryByRole('button', { name: /cancel series/i })).not.toBeInTheDocument();
  expect(screen.queryByText(/Monday · 7:30 AM/)).not.toBeInTheDocument();
  expect(api.adminCancelSeries).not.toHaveBeenCalled();
});

test('it points at the Schedules tab instead', async () => {
  const onManageSchedules = jest.fn();
  render(<ReservationsTab onManageSchedules={onManageSchedules} />);
  await screen.findByText('Timoteo Sumalinog');

  fireEvent.click(screen.getByRole('button', { name: /manage this schedule/i }));
  expect(onManageSchedules).toHaveBeenCalled();
});

test('expanding shows each day as an ordinary booking', async () => {
  render(<ReservationsTab />);
  await screen.findByText('Timoteo Sumalinog');

  fireEvent.click(screen.getByText(/Show all 3 bookings/));

  // Each occurrence keeps its own cancel — releasing one Tuesday is a booking
  // action and stays here, which is why the grouping is display only.
  await waitFor(() =>
    expect(screen.getAllByRole('button', { name: /^cancel$/i }).length).toBeGreaterThanOrEqual(3)
  );
});
