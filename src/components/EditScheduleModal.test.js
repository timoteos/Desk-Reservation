import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import EditScheduleModal from './EditScheduleModal';
import * as api from '../api/client';

jest.mock('../api/client');

// Desk 4 is where the schedule already sits; 9 is clear; 5 is partly taken.
const AVAILABILITY = {
  occurrences: 14,
  activeUntil: '2026-08-31',
  openEnded: false,
  generatedThrough: '2026-08-31',
  desks: [
    { deskId: 4, deskNumber: 4, occurrences: 14, conflicts: 0, bookable: 14 },
    { deskId: 5, deskNumber: 5, occurrences: 14, conflicts: 7, bookable: 7 },
    { deskId: 9, deskNumber: 9, occurrences: 14, conflicts: 0, bookable: 14 },
  ],
};

const SCHEDULE = {
  id: '37',
  name: 'Rhona Ramos',
  deskId: 4,
  deskNumber: 4,
  activeUntil: '2026-08-31',
  bookingsRemaining: 14,
  pattern: [
    { day: 'Monday', dayNumber: 1, startMin: 450, endMin: 1020 },
    { day: 'Wednesday', dayNumber: 3, startMin: 450, endMin: 1020 },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  api.getRecurringAvailability.mockResolvedValue(AVAILABILITY);
  api.adminEditSchedule.mockResolvedValue({
    seriesId: '37', deskNumber: 9, released: 14, regenerated: 14,
  });
});

const openDialog = (overrides = {}) =>
  render(<EditScheduleModal schedule={{ ...SCHEDULE, ...overrides }} onClose={() => {}} onSaved={() => {}} />);

test('opens on the schedule as it stands and discounts its own bookings', async () => {
  openDialog();

  await waitFor(() => expect(api.getRecurringAvailability).toHaveBeenCalled());
  // Without ignoreSeriesId the schedule's current desk would report as taken by
  // itself, and the dialog would refuse to save an unchanged desk.
  expect(api.getRecurringAvailability.mock.calls[0][0]).toMatchObject({
    ignoreSeriesId: '37',
    activeUntil: '2026-08-31',
    days: { mon: { startMin: 450, endMin: 1020 }, wed: { startMin: 450, endMin: 1020 } },
  });

  // Nothing changed yet, so there is nothing to save.
  expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
});

test('a partly taken desk cannot be picked', async () => {
  openDialog();
  await waitFor(() => expect(screen.getByLabelText(/Desk 5/)).toBeInTheDocument());

  expect(screen.getByLabelText('Desk 5, partial')).toBeDisabled();
  expect(screen.getByLabelText('Desk 9, available')).toBeEnabled();
});

test('moving to a clear desk saves the whole pattern', async () => {
  openDialog();
  await waitFor(() => expect(screen.getByLabelText('Desk 9, available')).toBeInTheDocument());

  fireEvent.click(screen.getByLabelText('Desk 9, available'));
  expect(screen.getByText(/free for all 14 days/)).toBeInTheDocument();

  const save = screen.getByRole('button', { name: /save changes/i });
  expect(save).toBeEnabled();
  fireEvent.click(save);

  await waitFor(() => expect(api.adminEditSchedule).toHaveBeenCalled());
  expect(api.adminEditSchedule).toHaveBeenCalledWith('37', {
    deskId: 9,
    activeUntil: '2026-08-31',
    days: { mon: { startMin: 450, endMin: 1020 }, wed: { startMin: 450, endMin: 1020 } },
  });
});

test('adding a weekday re-asks which desks can cover the larger pattern', async () => {
  openDialog();
  await waitFor(() => expect(api.getRecurringAvailability).toHaveBeenCalledTimes(1));

  fireEvent.click(screen.getByRole('button', { name: 'Fri' }));

  await waitFor(() => expect(api.getRecurringAvailability).toHaveBeenCalledTimes(2));
  const sent = api.getRecurringAvailability.mock.calls[1][0];
  expect(Object.keys(sent.days).sort()).toEqual(['fri', 'mon', 'wed']);
});

test('dropping every weekday leaves nothing to save', async () => {
  openDialog();
  await waitFor(() => expect(api.getRecurringAvailability).toHaveBeenCalled());

  fireEvent.click(screen.getByRole('button', { name: 'Mon' }));
  fireEvent.click(screen.getByRole('button', { name: 'Wed' }));

  expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  expect(screen.queryByLabelText(/^Desk /)).not.toBeInTheDocument();
});

test('a refusal from the server is shown and the dialog stays open', async () => {
  const onClose = jest.fn();
  api.adminEditSchedule.mockRejectedValue(new Error('Desk# 5 is already booked on 7 of the 14 days'));
  render(<EditScheduleModal schedule={SCHEDULE} onClose={onClose} onSaved={() => {}} />);

  await waitFor(() => expect(screen.getByLabelText('Desk 9, available')).toBeInTheDocument());
  fireEvent.click(screen.getByLabelText('Desk 9, available'));
  fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

  await waitFor(() => expect(screen.getByText(/already booked on 7 of the 14 days/)).toBeInTheDocument());
  expect(onClose).not.toHaveBeenCalled();
});

test('toggling a weekday off and back on is not a change', async () => {
  openDialog();
  await waitFor(() => expect(api.getRecurringAvailability).toHaveBeenCalled());

  // Object keys keep insertion order, so this used to leave days looking
  // different from the baseline while describing the same pattern — enabling Save
  // and releasing and regenerating every booking for nothing.
  fireEvent.click(screen.getByRole('button', { name: 'Mon' }));
  fireEvent.click(screen.getByRole('button', { name: 'Mon' }));

  expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
});

test('a weekday added back keeps the hours the schedule already works', async () => {
  openDialog();
  await waitFor(() => expect(api.getRecurringAvailability).toHaveBeenCalled());

  fireEvent.click(screen.getByRole('button', { name: 'Mon' }));
  fireEvent.click(screen.getByRole('button', { name: 'Mon' }));

  await waitFor(() => {
    const sent = api.getRecurringAvailability.mock.calls.at(-1)[0];
    expect(sent.days.mon).toEqual({ startMin: 450, endMin: 1020 });
  });
});

test('a brand new weekday copies the hours of the days already kept', async () => {
  // Mon/Wed run 9:00-13:00 here, so a new Friday should too rather than
  // defaulting to some fixed window.
  openDialog({
    pattern: [
      { day: 'Monday', dayNumber: 1, startMin: 540, endMin: 780 },
      { day: 'Wednesday', dayNumber: 3, startMin: 540, endMin: 780 },
    ],
  });
  await waitFor(() => expect(api.getRecurringAvailability).toHaveBeenCalled());

  fireEvent.click(screen.getByRole('button', { name: 'Fri' }));

  await waitFor(() => {
    const sent = api.getRecurringAvailability.mock.calls.at(-1)[0];
    expect(sent.days.fri).toEqual({ startMin: 540, endMin: 780 });
  });
});

test('an open-ended schedule keeps its end date blank', async () => {
  openDialog({ activeUntil: null });
  await waitFor(() => expect(api.getRecurringAvailability).toHaveBeenCalled());

  // activeUntil omitted rather than sent as an empty string, which the planner
  // would read as an invalid date.
  expect(api.getRecurringAvailability.mock.calls[0][0].activeUntil).toBeUndefined();
});
