// Mock existing reservations.
// startMin / endMin = minutes from midnight (e.g. 8:00 AM = 480, 4:30 PM = 990)
// Replace with real API calls once backend is ready.

const today = new Date();
const fmt = (d) => d.toISOString().split('T')[0];

const tomorrow = new Date(today);
tomorrow.setDate(today.getDate() + 1);

const dayAfter = new Date(today);
dayAfter.setDate(today.getDate() + 2);

const mockReservations = [
  // Today — 10:00 AM to 11:30 AM booked
  { id: '1', date: fmt(today), startMin: 600, endMin: 690, user: 'Keanu Ishihara' },

  // Tomorrow — two blocks booked: 9:00–10:00 AM and 1:00–3:00 PM
  { id: '2', date: fmt(tomorrow), startMin: 540, endMin: 600, user: 'Penny Kabua' },
  { id: '3', date: fmt(tomorrow), startMin: 780, endMin: 900, user: 'Megan Yamamoto' },

  // Day after — almost full: 8:00 AM–12:00 PM and 1:30–4:30 PM
  { id: '4', date: fmt(dayAfter), startMin: 480, endMin: 720, user: 'Angello Portillo' },
  { id: '5', date: fmt(dayAfter), startMin: 810, endMin: 990, user: 'Rafael Abitz' },
];

export const getBookingsForDate = (dateStr) =>
  mockReservations.filter((r) => r.date === dateStr);

export default mockReservations;
