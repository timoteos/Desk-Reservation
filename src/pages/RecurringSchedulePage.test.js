import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RecurringSchedulePage from './RecurringSchedulePage';
import * as api from '../api/client';

jest.mock('../api/client');

// Exactly what POST /api/recurring-schedules returns. No `skipped` — a schedule
// covers every one of its days or it is refused, so nothing is ever skipped.
const CREATED = {
  status: 'pending',
  confirmationCode: 'BT5D5J8R',
  expiresAt: '2027-08-01T12:00:00.000Z',
  deskNumber: 9,
  activeFrom: '2027-08-02',
  activeUntil: '2027-09-15',
  openEnded: false,
  generatedThrough: '2027-09-15',
  cappedAtCeiling: false,
  created: 14,
};

const AVAILABILITY = {
  occurrences: 14,
  activeFrom: '2027-08-02',
  activeUntil: '2027-09-15',
  openEnded: false,
  generatedThrough: '2027-09-15',
  cappedAtCeiling: false,
  desks: [{ deskId: 9, deskNumber: 9, occurrences: 14, conflicts: 0, bookable: 14 }],
};

const submit = async () => {
  render(<MemoryRouter><RecurringSchedulePage /></MemoryRouter>);

  fireEvent.click(screen.getByRole('button', { name: /^Mon/ }));
  await waitFor(() => expect(api.getRecurringAvailability).toHaveBeenCalled());
  fireEvent.click(await screen.findByLabelText(/Desk 9/));
  fireEvent.change(screen.getByPlaceholderText('you@dhs.hawaii.gov'), {
    target: { value: 'penny.kabua@dhs.hawaii.gov' },
  });
  fireEvent.click(screen.getByRole('button', { name: /set up recurring schedule/i }));
};

beforeEach(() => {
  jest.clearAllMocks();
  api.getRecurringAvailability.mockResolvedValue(AVAILABILITY);
  api.createRecurringSchedule.mockResolvedValue(CREATED);
});

test('a successful request renders its confirmation instead of crashing', async () => {
  // The response stopped carrying `skipped` when partial schedules were
  // forbidden, and this screen kept reading skipped.length — so every
  // successful recurring booking threw on the success screen, after the
  // schedule had already been created.
  await submit();

  expect(await screen.findByText('Request submitted')).toBeInTheDocument();
  expect(screen.getByText(/Desk# 9/)).toBeInTheDocument();
  expect(screen.getByText(/14 bookings/)).toBeInTheDocument();
});

test('the confirmation shows the one code for the whole schedule', async () => {
  await submit();

  expect(await screen.findByText('BT5D5J8R')).toBeInTheDocument();
  expect(screen.getByText(/One code for the whole schedule/)).toBeInTheDocument();
});

test('nothing mentions skipped days, because there cannot be any', async () => {
  await submit();

  await screen.findByText('Request submitted');
  expect(screen.queryByText(/skipped/i)).not.toBeInTheDocument();
});
