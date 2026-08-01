import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import LiveFloor from './LiveFloor';
import * as api from '../api/client';

jest.mock('../api/client');

const FLOOR = {
  nowMin: 700,   // 11:40
  desks: [
    { id: '1', number: 1, label: 'Desk# 1', status: 'in_use', untilMin: 1020 },
    { id: '2', number: 2, label: 'Desk# 2', status: 'reserved', untilMin: 840 },
    { id: '3', number: 3, label: 'Desk# 3', status: 'free', freeUntilMin: 780 },
    { id: '4', number: 4, label: 'Desk# 4', status: 'free', freeUntilMin: 1020 },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  api.getDeskStatus.mockResolvedValue(FLOOR);
  api.claimDesk.mockResolvedValue({
    confirmationCode: 'WALK0001', name: 'Mark Burgess',
    deskNumber: 4, startMin: 700, endMin: 1020,
  });
});

test('it counts what is actually free, not what is merely unbooked', async () => {
  render(<LiveFloor />);
  expect(await screen.findByText('2 of 4 desks free right now')).toBeInTheDocument();
});

test('a free desk can be taken; one in use cannot', async () => {
  render(<LiveFloor />);
  await screen.findByText(/2 of 4 desks free/);

  expect(screen.getByLabelText('Desk 4, free')).toBeEnabled();
  expect(screen.getByLabelText('Desk 1, in use')).toBeDisabled();
  expect(screen.getByLabelText(/Desk 2, reserved/)).toBeDisabled();
});

test('choosing a desk says how long it is actually yours for', async () => {
  render(<LiveFloor />);
  await screen.findByText(/2 of 4 desks free/);

  // Desk 3 is booked by somebody else at 1pm, so the offer has to stop there.
  fireEvent.click(screen.getByLabelText('Desk 3, free'));
  expect(await screen.findByText(/until 1:00 PM, when it is booked/)).toBeInTheDocument();

  // Desk 4 runs to the end of the day, so there is nothing to warn about.
  fireEvent.click(screen.getByLabelText('Desk 4, free'));
  expect(await screen.findByText(/free until 5:00 PM\./)).toBeInTheDocument();
});

test('the end times offered stop where the desk stops being free', async () => {
  render(<LiveFloor />);
  await screen.findByText(/2 of 4 desks free/);

  // now is 11:40; desk 3 is booked at 1pm.
  fireEvent.click(screen.getByLabelText('Desk 3, free'));
  const options = [...(await screen.findByRole('combobox')).options].map((o) => o.textContent);

  expect(options[0]).toBe('12:00 PM');
  expect(options.at(-1)).toMatch(/^1:00 PM/);
  // Nothing past the booking that follows.
  expect(options.some((o) => o.startsWith('1:30'))).toBe(false);
});

test('a shorter stay can be chosen, and is what gets sent', async () => {
  render(<LiveFloor />);
  await screen.findByText(/2 of 4 desks free/);

  fireEvent.click(screen.getByLabelText('Desk 4, free'));
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '780' } });
  fireEvent.change(screen.getByLabelText(/your email address/i), {
    target: { value: 'mark.burgess@dhs.hawaii.gov' },
  });
  fireEvent.click(screen.getByRole('button', { name: /take it until 1:00 PM/i }));

  await waitFor(() => expect(api.claimDesk).toHaveBeenCalledWith(4, {
    email: 'mark.burgess@dhs.hawaii.gov',
    endMin: 780,
  }));
});

test('switching desks drops a choice the new desk could not honour', async () => {
  render(<LiveFloor />);
  await screen.findByText(/2 of 4 desks free/);

  // Desk 4 runs to 5pm, so 4:00 is offered there.
  fireEvent.click(screen.getByLabelText('Desk 4, free'));
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '960' } });

  // Desk 3 stops at 1pm. The old choice must not survive.
  fireEvent.click(screen.getByLabelText('Desk 3, free'));
  expect(screen.getByRole('button', { name: /take it until 1:00 PM/i })).toBeInTheDocument();
});

test('taking a desk sends the desk and the address, and reports back', async () => {
  const onClaimed = jest.fn();
  render(<LiveFloor onClaimed={onClaimed} />);
  await screen.findByText(/2 of 4 desks free/);

  fireEvent.click(screen.getByLabelText('Desk 4, free'));
  fireEvent.change(screen.getByLabelText(/your email address/i), {
    target: { value: 'mark.burgess@dhs.hawaii.gov' },
  });
  fireEvent.click(screen.getByRole('button', { name: /take it until/i }));

  await waitFor(() => expect(api.claimDesk).toHaveBeenCalledWith(4, {
    email: 'mark.burgess@dhs.hawaii.gov',
    endMin: 1020,
  }));
  await waitFor(() => expect(onClaimed).toHaveBeenCalled());
});

test('losing the desk to somebody else is explained, and the floor re-read', async () => {
  api.claimDesk.mockRejectedValue(new Error('Somebody just took that desk. Pick another.'));
  render(<LiveFloor />);
  await screen.findByText(/2 of 4 desks free/);

  fireEvent.click(screen.getByLabelText('Desk 4, free'));
  fireEvent.change(screen.getByLabelText(/your email address/i), {
    target: { value: 'mark.burgess@dhs.hawaii.gov' },
  });
  const before = api.getDeskStatus.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: /take it until/i }));

  expect(await screen.findByText(/Somebody just took that desk/)).toBeInTheDocument();
  // Re-read, so whoever took it is now visible rather than the screen insisting
  // the desk is still free. Counted as an increase rather than a total, because
  // selecting a desk also refreshes and the exact number is not the point.
  await waitFor(() => expect(api.getDeskStatus.mock.calls.length).toBeGreaterThan(before));
});

test('a desk taken while the form is open says so and blocks the submit', async () => {
  jest.useFakeTimers();
  try {
    render(<LiveFloor />);
    await act(async () => { await Promise.resolve(); });

    fireEvent.click(screen.getByLabelText('Desk 4, free'));
    fireEvent.change(screen.getByLabelText(/your email address/i), {
      target: { value: 'mark.burgess@dhs.hawaii.gov' },
    });
    expect(screen.getByRole('button', { name: /take it until/i })).toBeEnabled();

    // Somebody else takes it between refreshes.
    api.getDeskStatus.mockResolvedValue({
      ...FLOOR,
      desks: FLOOR.desks.map((d) =>
        d.number === 4 ? { id: '4', number: 4, label: 'Desk# 4', status: 'in_use', untilMin: 1020 } : d),
    });
    await act(async () => { jest.advanceTimersByTime(5000); await Promise.resolve(); });

    expect(screen.getByText(/took Desk# 4 while you were filling this in/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /take it until/i })).toBeDisabled();
  } finally {
    jest.useRealTimers();
  }
});

test('it refreshes faster while a desk is being chosen', async () => {
  jest.useFakeTimers();
  try {
    render(<LiveFloor />);
    await act(async () => { await Promise.resolve(); });

    // Idle: nothing at five seconds.
    const idle = api.getDeskStatus.mock.calls.length;
    await act(async () => { jest.advanceTimersByTime(5000); await Promise.resolve(); });
    expect(api.getDeskStatus.mock.calls.length).toBe(idle);

    fireEvent.click(screen.getByLabelText('Desk 4, free'));
    await act(async () => { await Promise.resolve(); });
    const choosing = api.getDeskStatus.mock.calls.length;

    // Choosing: the window where staleness is actually felt.
    await act(async () => { jest.advanceTimersByTime(5000); await Promise.resolve(); });
    expect(api.getDeskStatus.mock.calls.length).toBeGreaterThan(choosing);
  } finally {
    jest.useRealTimers();
  }
});

test('when the network drops it says so instead of insisting desks are free', async () => {
  jest.useFakeTimers();
  try {
    render(<LiveFloor />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText(/2 of 4 desks free/)).toBeInTheDocument();

    api.getDeskStatus.mockRejectedValue(new Error('Cannot reach the server.'));
    await act(async () => { jest.advanceTimersByTime(20000); await Promise.resolve(); });

    expect(screen.getByText(/Can.t reach the system/)).toBeInTheDocument();
    // The last known floor is still drawn — blanking it would be less useful,
    // but it is no longer claimed to be current.
    expect(screen.getByText(/2 of 4 desks free/)).toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});

test('it keeps refreshing on its own', async () => {
  jest.useFakeTimers();
  try {
    render(<LiveFloor />);
    await act(async () => { await Promise.resolve(); });
    expect(api.getDeskStatus).toHaveBeenCalledTimes(1);

    await act(async () => { jest.advanceTimersByTime(20000); await Promise.resolve(); });
    expect(api.getDeskStatus).toHaveBeenCalledTimes(2);
  } finally {
    jest.useRealTimers();
  }
});

test('a full floor says so rather than inviting a tap that cannot work', async () => {
  api.getDeskStatus.mockResolvedValue({
    nowMin: 700,
    desks: FLOOR.desks.map((d) => ({ ...d, status: 'in_use', untilMin: 1020 })),
  });
  render(<LiveFloor />);

  expect(await screen.findByText(/Every desk is taken at the moment/)).toBeInTheDocument();
});

const chooseVisitor = async () => {
  render(<LiveFloor />);
  await screen.findByText(/2 of 4 desks free/);
  fireEvent.click(screen.getByLabelText('Desk 4, free'));
  fireEvent.click(screen.getByRole('button', { name: /a visitor/i }));
};

test('a visitor gives their own details and names who they are seeing', async () => {
  await chooseVisitor();

  fireEvent.change(screen.getByLabelText(/visitor first name/i), { target: { value: 'Ana' } });
  fireEvent.change(screen.getByLabelText(/visitor last name/i), { target: { value: 'Cruz' } });
  fireEvent.change(screen.getByLabelText(/visitor email/i), { target: { value: 'ana@acme.test' } });
  fireEvent.change(screen.getByLabelText(/visitor company/i), { target: { value: 'Acme' } });
  fireEvent.change(screen.getByLabelText(/here to see/i), { target: { value: 'rhona.ramos@dhs.hawaii.gov' } });
  fireEvent.click(screen.getByRole('button', { name: /take it until/i }));

  await waitFor(() => expect(api.claimDesk).toHaveBeenCalledWith(4, {
    guest: { firstName: 'Ana', lastName: 'Cruz', email: 'ana@acme.test', organization: 'Acme' },
    hostEmail: 'rhona.ramos@dhs.hawaii.gov',
    endMin: 1020,
  }));
});

test('a visitor cannot take a desk without naming a host', async () => {
  // Sponsorship is not waived at the front desk, it is asked for. Without a
  // host nobody answers for a stranger holding a desk in the building.
  await chooseVisitor();

  fireEvent.change(screen.getByLabelText(/visitor first name/i), { target: { value: 'Ana' } });
  fireEvent.change(screen.getByLabelText(/visitor last name/i), { target: { value: 'Cruz' } });
  fireEvent.change(screen.getByLabelText(/visitor email/i), { target: { value: 'ana@acme.test' } });

  expect(screen.getByRole('button', { name: /take it until/i })).toBeDisabled();

  fireEvent.change(screen.getByLabelText(/here to see/i), { target: { value: 'rhona.ramos@dhs.hawaii.gov' } });
  expect(screen.getByRole('button', { name: /take it until/i })).toBeEnabled();
});

test('the form says what naming a host actually means', async () => {
  await chooseVisitor();
  expect(screen.getByText(/recorded as sponsoring this visit/i)).toBeInTheDocument();
});

test('staff still take a desk with an address alone', async () => {
  render(<LiveFloor />);
  await screen.findByText(/2 of 4 desks free/);
  fireEvent.click(screen.getByLabelText('Desk 4, free'));

  // No visitor fields until asked for.
  expect(screen.queryByLabelText(/visitor first name/i)).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/your email address/i), {
    target: { value: 'mark.burgess@dhs.hawaii.gov' },
  });
  fireEvent.click(screen.getByRole('button', { name: /take it until/i }));

  await waitFor(() => expect(api.claimDesk).toHaveBeenCalled());

  const sent = api.claimDesk.mock.calls[0][1];
  expect(sent).not.toHaveProperty('guest');
  expect(sent).not.toHaveProperty('hostEmail');
  expect(sent.email).toBe('mark.burgess@dhs.hawaii.gov');
});
