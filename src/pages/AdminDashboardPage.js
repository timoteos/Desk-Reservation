import { useState } from 'react';
import { Plus, X, LayoutGrid, ScrollText, Inbox, CalendarClock } from 'lucide-react';
import mockUsers from '../data/mockUsers';
import mockReservations from '../data/mockReservations';

const TABS = [
  { key: 'main', label: 'Main', icon: LayoutGrid },
  { key: 'logs', label: 'Logs', icon: ScrollText },
  { key: 'requests', label: 'Requests', icon: Inbox },
];

const USERS_PER_PAGE = 16;

const formatMinutes = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
};

const formatDate = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};

const todayStr = new Date().toISOString().split('T')[0];

const getUpcomingReservations = (userName) =>
  mockReservations
    .filter((r) => r.user === userName && r.date >= todayStr)
    .sort((a, b) => (a.date === b.date ? a.startMin - b.startMin : a.date.localeCompare(b.date)));

function UserDetailModal({ user, onClose }) {
  if (!user) return null;
  const reservations = getUpcomingReservations(user.name);

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-mqd-title text-xl font-bold mb-1">{user.name}</h2>
        <p className="text-gray-500 text-sm mb-5">Upcoming confirmed reservations</p>

        {reservations.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CalendarClock className="w-9 h-9 text-gray-300" />
            <p className="text-gray-500 text-sm">No upcoming reservations.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 max-h-80 overflow-y-auto pr-1">
            {reservations.map((r) => (
              <div key={r.id} className="border border-gray-200 rounded-lg p-4 text-sm">
                <p className="font-semibold text-gray-800">{formatDate(r.date)}</p>
                <p className="text-gray-500">{formatMinutes(r.startMin)} - {formatMinutes(r.endMin)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MainTab({ users, selectedUserId, onSelectUser }) {
  return (
    <div className="bg-gray-200 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-800 tracking-wide">USERS</h1>
        <button
          aria-label="Add user"
          className="w-9 h-9 rounded-lg bg-white border border-gray-300 flex items-center justify-center hover:bg-gray-50 transition"
        >
          <Plus className="w-4 h-4 text-gray-700" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {users.map((user) => {
          const isSelected = user.id === selectedUserId;
          return (
            <button
              key={user.id}
              onClick={() => onSelectUser(user)}
              className={`bg-mqd-btn hover:bg-mqd-btn-hover text-white text-sm font-semibold py-3 rounded-lg transition
                ${isSelected ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-200' : ''}`}
            >
              {user.name}
            </button>
          );
        })}
      </div>

      <div className="flex justify-center mt-6">
        <button className="bg-gray-500 hover:bg-gray-600 text-white text-sm font-semibold px-6 py-2 rounded-lg transition">
          Next Page
        </button>
      </div>
    </div>
  );
}

function LogsTab() {
  return (
    <div className="bg-gray-200 rounded-2xl p-6 min-h-[300px] flex flex-col items-center justify-center gap-2 text-center">
      <ScrollText className="w-10 h-10 text-gray-400" />
      <h2 className="text-lg font-semibold text-gray-700">No activity logs yet</h2>
      <p className="text-gray-500 text-sm max-w-sm">
        Reservation and admin activity will appear here once the system is connected to the backend.
      </p>
    </div>
  );
}

function RequestsTab() {
  return (
    <div className="bg-gray-200 rounded-2xl p-6 min-h-[300px] flex flex-col items-center justify-center gap-2 text-center">
      <Inbox className="w-10 h-10 text-gray-400" />
      <h2 className="text-lg font-semibold text-gray-700">No pending requests</h2>
      <p className="text-gray-500 text-sm max-w-sm">
        New desk requests awaiting admin approval will show up here.
      </p>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState('main');
  const [selectedUser, setSelectedUser] = useState(null);

  const users = mockUsers.slice(0, USERS_PER_PAGE);

  return (
    <div className="flex-1 flex flex-col items-center px-4 md:px-8 py-8 bg-white">
      <div className="w-full max-w-2xl">
        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-semibold transition
                  ${isActive
                    ? 'bg-gray-300 text-gray-900'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === 'main' && (
          <MainTab users={users} selectedUserId={selectedUser?.id} onSelectUser={setSelectedUser} />
        )}
        {activeTab === 'logs' && <LogsTab />}
        {activeTab === 'requests' && <RequestsTab />}
      </div>

      <UserDetailModal user={selectedUser} onClose={() => setSelectedUser(null)} />
    </div>
  );
}
