// Single place the frontend talks to the backend. Every page goes through
// these functions rather than calling fetch directly, so the API surface is
// visible in one file and error handling stays consistent.

// Trailing slash stripped, because every path below starts with one and the two
// concatenate into `https://host//api/...`, which Express does not route — a 404
// on every single call, from a value that looks entirely correct in the .env file
// and in the Render dashboard. Costly to diagnose, one character to prevent.
const BASE_URL = (process.env.REACT_APP_API_URL || 'http://localhost:5001').replace(/\/+$/, '');

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const TOKEN_KEY = 'mqd.token';

export const getStoredToken = () => localStorage.getItem(TOKEN_KEY);
export const storeSession = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('mqd.admin');
};

async function request(path, options = {}) {
  const token = getStoredToken();
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...options,
    });
  } catch {
    // fetch only rejects on network failure — the server being down, usually.
    throw new ApiError('Cannot reach the server. Is the backend running?', 0);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.message || `Request failed (${response.status})`, response.status);
  }

  return response.json();
}

export const getReservationsForDate = (date) =>
  request(`/api/reservations?date=${encodeURIComponent(date)}`);

// Administrative list. scope: 'upcoming' (default) | 'past' | 'all'
export const getAllReservations = (scope = 'upcoming') =>
  request(`/api/reservations?scope=${encodeURIComponent(scope)}`);

export const adminCancelReservation = (id) =>
  request(`/api/requests/reservations/${encodeURIComponent(id)}/cancel`, { method: 'PATCH' });

// Standing arrangements rather than bookings — who holds a desk, and until when.
export const getSchedules = () => request('/api/schedules');

// The days a schedule still has coming, so one can be freed without ending it.
export const getScheduleDays = (seriesId) =>
  request(`/api/schedules/${encodeURIComponent(seriesId)}/days`);

// Changes a live schedule. Send only what differs; days already served are not
// affected.
export const adminEditSchedule = (seriesId, changes) =>
  request(`/api/schedules/${encodeURIComponent(seriesId)}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });

// Ends a recurring schedule and releases the bookings it still holds.
export const adminCancelSeries = (scheduleId) =>
  request(`/api/requests/schedules/${encodeURIComponent(scheduleId)}/cancel`, { method: 'PATCH' });

// Moves a booking to a different desk, time, or both. Send only what changed.
export const adminEditReservation = (id, changes) =>
  request(`/api/requests/reservations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });

export const getReservationByCode = (code) =>
  request(`/api/reservations/code/${encodeURIComponent(code)}`);

export const createReservation = (payload) =>
  request('/api/reservations', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

// What each desk could offer a pattern, before committing to it. A POST because
// the pattern is the input and does not fit in a query string.
export const getRecurringAvailability = (payload) =>
  request('/api/recurring-schedules/availability', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const createRecurringSchedule = (payload) =>
  request('/api/recurring-schedules', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const getDesks = () => request('/api/desks');

export const login = (email, password) =>
  request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

export const getCurrentAdmin = () => request('/api/auth/me');

// Check-in takes no token: the confirmation code is the credential, and it is
// the only one a sponsored visitor will ever have.
export const checkIn = (code) =>
  request(`/api/reservations/code/${encodeURIComponent(code)}/check-in`, { method: 'POST' });

// Cancels whatever the code stands for: a single booking, or a whole schedule.
// The response says which in `kind`.
export const cancelReservation = (code) =>
  request(`/api/reservations/code/${encodeURIComponent(code)}/cancel`, { method: 'PATCH' });

// One day of a schedule, for the week someone is on leave. The schedule's own
// code is the credential — occurrences never carry one of their own.
export const cancelScheduleDay = (code, occurrenceId) =>
  request(
    `/api/reservations/code/${encodeURIComponent(code)}/occurrence/${encodeURIComponent(occurrenceId)}/cancel`,
    { method: 'PATCH' }
  );

export const adminBook = (payload) =>
  request('/api/requests/book', { method: 'POST', body: JSON.stringify(payload) });

export const getLogs = (activity = '') =>
  request(`/api/logs${activity ? `?activity=${encodeURIComponent(activity)}` : ''}`);

export const getActivityTypes = () => request('/api/logs/activities');

export const getRequests = () => request('/api/requests');

export const decideRequest = (kind, id, decision) =>
  request(`/api/requests/${kind === 'recurring' ? 'recurring' : 'one-off'}/${id}`, {
    method: 'PATCH',
    // The backend takes the acting admin from the verified token.
    body: JSON.stringify({ decision }),
  });

export const getUsers = () => request('/api/users');

export const getUserReservations = (userId) =>
  request(`/api/users/${encodeURIComponent(userId)}/reservations`);

export { ApiError };
