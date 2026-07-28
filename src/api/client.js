// Single place the frontend talks to the backend. Every page goes through
// these functions rather than calling fetch directly, so the API surface is
// visible in one file and error handling stays consistent.

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
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

export const getReservationByCode = (code) =>
  request(`/api/reservations/code/${encodeURIComponent(code)}`);

export const createReservation = (payload) =>
  request('/api/reservations', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const createRecurringSchedule = (payload) =>
  request('/api/recurring-schedules', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const getDesks = () => request('/api/desks');

export const getUsers = () => request('/api/users');

export const getUserReservations = (userId) =>
  request(`/api/users/${encodeURIComponent(userId)}/reservations`);

export { ApiError };
