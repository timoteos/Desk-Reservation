// Predefined 2-hour office booking slots (office hours: 8:30 AM – 4:30 PM)
const TIME_SLOTS = [
  { startTime: '08:30', endTime: '10:30', label: '8:30 AM – 10:30 AM' },
  { startTime: '10:30', endTime: '12:30', label: '10:30 AM – 12:30 PM' },
  { startTime: '12:30', endTime: '14:30', label: '12:30 PM – 2:30 PM' },
  { startTime: '14:30', endTime: '16:30', label: '2:30 PM – 4:30 PM' },
];

const isValidSlot = (startTime, endTime) =>
  TIME_SLOTS.some((s) => s.startTime === startTime && s.endTime === endTime);

module.exports = { TIME_SLOTS, isValidSlot };
