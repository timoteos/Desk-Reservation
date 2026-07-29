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

export const login = (email, password) =>
  request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

export const getCurrentAdmin = () => request('/api/auth/me');

export const cancelReservation = (code) =>
  request(`/api/reservations/code/${encodeURIComponent(code)}/cancel`, { method: 'PATCH' });

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
