import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ScheduleDays from './ScheduleDays';
import * as api from '../api/client';

jest.mock('../api/client');

const DAYS = [
  { id: '644', date: '2027-08-03', startMin: 450, endMin: 1020, status: 'approved', deskNumber: 1 },
  { id: '645', date: '2027-08-04', startMin: 450, endMin: 1020, status: 'approved', deskNumber: 1 },
  { id: '646', date: '2027-08-05', startMin: 450, endMin: 1020, status: 'approved', deskNumber: 1 },
];

beforeEach(() => {
  jest.clearAllMocks();
  api.getScheduleDays.mockResolvedValue(DAYS);
  api.adminCancelReservation.mockResolvedValue({ status: 'canceled' });
});

test('lists the days a schedule still has coming', async () => {
  render(<ScheduleDays seriesId="6" deskNumber={1} />);

  await screen.findByText(/Aug 3/);
  expect(screen.getByText(/Aug 4/)).toBeInTheDocument();
  expect(screen.getByText(/Aug 5/)).toBeInTheDocument();
  expect(api.getScheduleDays).toHaveBeenCalledWith('6');
});

test('one day can be released without ending the schedule', async () => {
  const onChanged = jest.fn();
  render(<ScheduleDays seriesId="6" deskNumber={1} onChanged={onChanged} />);
  await screen.findByText(/Aug 3/);

  // Two clicks, because releasing somebody's desk for a day is not undoable
  // from here.
  fireEvent.click(screen.getAllByRole('button', { name: /release this day/i })[0]);
  fireEvent.click(screen.getByRole('button', { name: /^release$/i }));

  await waitFor(() => expect(api.adminCancelReservation).toHaveBeenCalledWith('644'));
  // The arrangement itself is untouched — this is a booking action.
  expect(api.adminCancelSeries).not.toHaveBeenCalled();
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
});

test('backing out releases nothing', async () => {
  render(<ScheduleDays seriesId="6" deskNumber={1} />);
  await screen.findByText(/Aug 3/);

  fireEvent.click(screen.getAllByRole('button', { name: /release this day/i })[0]);
  fireEvent.click(screen.getByRole('button', { name: /^keep$/i }));

  expect(api.adminCancelReservation).not.toHaveBeenCalled();
  expect(screen.getAllByRole('button', { name: /release this day/i })).toHaveLength(3);
});

test('a schedule with nothing left to come says so', async () => {
  api.getScheduleDays.mockResolvedValue([]);
  render(<ScheduleDays seriesId="6" deskNumber={1} />);

  expect(await screen.findByText(/No days still to come/)).toBeInTheDocument();
});

test('a failed release is reported and the list is re-read', async () => {
  api.adminCancelReservation.mockRejectedValue(new Error('That booking has already started.'));
  render(<ScheduleDays seriesId="6" deskNumber={1} />);
  await screen.findByText(/Aug 3/);

  fireEvent.click(screen.getAllByRole('button', { name: /release this day/i })[0]);
  fireEvent.click(screen.getByRole('button', { name: /^release$/i }));

  expect(await screen.findByText(/already started/)).toBeInTheDocument();
  // Re-read, so what is on screen is what the server has rather than an
  // optimistic guess that just failed.
  await waitFor(() => expect(api.getScheduleDays).toHaveBeenCalledTimes(2));
});
