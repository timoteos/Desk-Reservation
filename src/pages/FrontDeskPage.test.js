import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import FrontDeskPage from './FrontDeskPage';
import * as api from '../api/client';

jest.mock('../api/client');

const CHECKED_IN = {
  name: 'Keanu Ishihara',
  deskNumber: 7,
  startMin: 540,
  endMin: 1020,
  reclaimed: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  api.checkIn.mockResolvedValue(CHECKED_IN);
});

const enter = (code) => {
  fireEvent.change(screen.getByLabelText(/confirmation code/i), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: /^check in$/i }));
};

test('a code checks the holder in and shows them which desk to walk to', async () => {
  render(<FrontDeskPage />);
  enter('KS5CTVXU');

  await waitFor(() => expect(api.checkIn).toHaveBeenCalledWith('KS5CTVXU'));
  expect(await screen.findByText('Keanu Ishihara')).toBeInTheDocument();
  expect(screen.getByText(/Desk# 7/)).toBeInTheDocument();
});

test('a lowercase code is accepted — nobody types in capitals', async () => {
  render(<FrontDeskPage />);
  enter('ks5ctvxu');

  await waitFor(() => expect(api.checkIn).toHaveBeenCalledWith('KS5CTVXU'));
});

test('a refusal is shown in the words the server used', async () => {
  api.checkIn.mockRejectedValue(new Error('Too early — check in from 30 minutes before it starts.'));
  render(<FrontDeskPage />);
  enter('KS5CTVXU');

  expect(await screen.findByText(/Too early/)).toBeInTheDocument();
  // Still on the form, so the next person can try immediately.
  expect(screen.getByLabelText(/confirmation code/i)).toBeInTheDocument();
});

test('a reclaimed desk says so, rather than looking like an ordinary check-in', async () => {
  api.checkIn.mockResolvedValue({ ...CHECKED_IN, reclaimed: true });
  render(<FrontDeskPage />);
  enter('KS5CTVXU');

  expect(await screen.findByText(/had been released because nobody had arrived/i)).toBeInTheDocument();
});

test('the screen clears itself, so the last person is not left on it', async () => {
  jest.useFakeTimers();
  try {
    render(<FrontDeskPage />);
    fireEvent.change(screen.getByLabelText(/confirmation code/i), { target: { value: 'KS5CTVXU' } });
    fireEvent.click(screen.getByRole('button', { name: /^check in$/i }));

    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('Keanu Ishihara')).toBeInTheDocument();

    act(() => { jest.advanceTimersByTime(12000); });

    // Back to the prompt, with the field empty.
    expect(screen.queryByText('Keanu Ishihara')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/confirmation code/i)).toHaveValue('');
  } finally {
    jest.useRealTimers();
  }
});

test('it offers no way to cancel a booking', async () => {
  // This is a shared screen in a lobby. The holder's own page may cancel;
  // this one must not, or somebody else's booking is one careless tap away.
  render(<FrontDeskPage />);
  enter('KS5CTVXU');
  await screen.findByText('Keanu Ishihara');

  expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
});

test('a walk-up is shown the code it was issued, and given time to write it down', async () => {
  // Nothing emails a code yet. If this screen does not show it, the person
  // walks away with a booking they have no way to reach again.
  jest.useFakeTimers();
  try {
    const { rerender } = render(<FrontDeskPage />);
    api.checkIn.mockResolvedValue({ ...CHECKED_IN, confirmationCode: 'WALK0001' });
    enter('IGNORED1');
    await act(async () => { await Promise.resolve(); });

    expect(screen.getByText('WALK0001')).toBeInTheDocument();
    expect(screen.getByText(/write this down/i)).toBeInTheDocument();

    // Still there after the ordinary twelve seconds.
    act(() => { jest.advanceTimersByTime(12000); });
    expect(screen.getByText('WALK0001')).toBeInTheDocument();

    act(() => { jest.advanceTimersByTime(33000); });
    expect(screen.queryByText('WALK0001')).not.toBeInTheDocument();
    rerender(<FrontDeskPage />);
  } finally {
    jest.useRealTimers();
  }
});
