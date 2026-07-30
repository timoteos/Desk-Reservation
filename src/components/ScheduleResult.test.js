import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ScheduleResult from './ScheduleResult';
import * as api from '../api/client';

jest.mock('../api/client');

const LIVE = {
  kind: 'schedule',
  scheduleId: 6,
  confirmationCode: 'BT5D5J8R',
  user: 'Timoteo Sumalinog',
  deskNumber: 1,
  status: 'approved',
  activeFrom: '2027-07-29',
  activeUntil: '2027-08-05',
  openEnded: false,
  pattern: [
    { day: 'Monday', dayNumber: 1, startMin: 450, endMin: 1020 },
    { day: 'Tuesday', dayNumber: 2, startMin: 450, endMin: 1020 },
  ],
  today: null,
  upcoming: [
    { id: '644', date: '2027-08-03', startMin: 450, endMin: 1020, status: 'approved' },
    { id: '645', date: '2027-08-04', startMin: 450, endMin: 1020, status: 'approved' },
  ],
  bookingsRemaining: 2,
};

// What the lookup returns once an admin has ended it: no pattern, no dates,
// nothing coming up.
const ENDED = {
  ...LIVE,
  status: 'canceled',
  activeFrom: null,
  activeUntil: null,
  pattern: [],
  upcoming: [],
  bookingsRemaining: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  api.cancelScheduleDay.mockResolvedValue({ status: 'canceled' });
});

test('a running schedule shows one code and the days coming up', async () => {
  render(<ScheduleResult schedule={LIVE} onChanged={jest.fn()} />);

  expect(screen.getByText('Recurring schedule found')).toBeInTheDocument();
  expect(screen.getByText('BT5D5J8R')).toBeInTheDocument();
  expect(screen.getByText(/One code for the whole schedule/)).toBeInTheDocument();
  expect(screen.getByText(/2 days coming up/)).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /not coming in/i })).toHaveLength(2);
});

test('releasing one day keeps the rest of the schedule', async () => {
  const onChanged = jest.fn();
  render(<ScheduleResult schedule={LIVE} onChanged={onChanged} />);

  fireEvent.click(screen.getAllByRole('button', { name: /not coming in/i })[0]);
  fireEvent.click(screen.getByRole('button', { name: /release it/i }));

  // The schedule's own code is the credential; the day is named by id, so no
  // occurrence ever needs a code of its own.
  await waitFor(() => expect(api.cancelScheduleDay).toHaveBeenCalledWith('BT5D5J8R', '644'));
  expect(api.cancelReservation).not.toHaveBeenCalled();
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
});

test('an ended schedule says so rather than looking healthy', () => {
  render(<ScheduleResult schedule={ENDED} onChanged={jest.fn()} />);

  // It previously came back under "Recurring schedule found" with a green tick
  // and no status anywhere, so an admin ending somebody's arrangement was
  // invisible to them.
  expect(screen.queryByText('Recurring schedule found')).not.toBeInTheDocument();
  expect(screen.getByText('This schedule is no longer running')).toBeInTheDocument();
  expect(screen.getByText('Ended')).toBeInTheDocument();

  // And nothing invites action on something that is over.
  expect(screen.queryByRole('button', { name: /not coming in/i })).not.toBeInTheDocument();
  expect(screen.queryByText(/One code for the whole schedule/)).not.toBeInTheDocument();
});

test('an ended schedule states no dates rather than an em dash', () => {
  render(<ScheduleResult schedule={ENDED} onChanged={jest.fn()} />);
  expect(screen.queryByText(/Runs:/)).not.toBeInTheDocument();
});

test("today's occurrence is called out for the walk to the desk", () => {
  render(
    <ScheduleResult
      schedule={{
        ...LIVE,
        today: { id: '644', date: '2027-08-03', startMin: 450, endMin: 1020, status: 'approved' },
      }}
      onChanged={jest.fn()}
    />
  );
  expect(screen.getByText(/Today:/)).toBeInTheDocument();
});
