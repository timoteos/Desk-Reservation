import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, X, Check, Search, CalendarDays, Users, ScrollText, Inbox, CalendarClock, CalendarPlus, Copy } from 'lucide-react';
import AdminBookingModal from '../components/AdminBookingModal';
import ReservationsTab from '../components/ReservationsTab';
import LogsTab from '../components/LogsTab';
import SchedulesTab from '../components/SchedulesTab';
import {
  getUsers,
  getUserReservations,
  getRequests,
  decideRequest,
} from '../api/client';

// Ordered by what an admin does, not by when each tab was built.
//
// Reservations and Schedules sit together because they answer the same question
// from two angles — who has a desk today, and who has a standing claim on one.
// Requests follows: it is the only tab holding work, and being last was wrong
// for the one thing that needs a decision. Users is a directory and Logs is
// history, so both are reference and go at the end.
const TABS = [
  { key: 'reservations', label: 'Reservations', icon: CalendarDays },
  { key: 'schedules', label: 'Schedules', icon: CalendarClock },
  { key: 'requests', label: 'Requests', icon: Inbox },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'logs', label: 'Logs', icon: ScrollText },
];

// How often the pending queue re-checks itself while the dashboard is open.
const REQUEST_POLL_MS = 60 * 1000;

const formatMinutes = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
};

const shortDay = (dateStr) =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

const formatDate = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};

function CopyableCode({ code }) {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef(null);

  // Browsers refuse clipboard access in plenty of situations — no user
  // gesture, insecure context, permission denied. Falling back to selecting
  // the text means the click still achieves something rather than appearing
  // to do nothing.
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const range = document.createRange();
      range.selectNodeContents(codeRef.current);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  };

  return (
    <button
      onClick={copy}
      title="Copy confirmation code"
      className="mt-2 inline-flex items-center gap-1.5 font-mono text-xs tracking-wider text-mqd-title bg-mqd-btn/10 hover:bg-mqd-btn/20 rounded px-2 py-1 transition"
    >
      <span ref={codeRef} className="select-all">{code}</span>
      {copied ? <Check className="w-3 h-3 shrink-0" /> : <Copy className="w-3 h-3 shrink-0 opacity-60" />}
    </button>
  );
}

function UserDetailModal({ user, onClose }) {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    setLoading(true);

    getUserReservations(user.id)
      .then((data) => { if (!cancelled) setReservations(data); })
      .catch(() => { if (!cancelled) setReservations([]); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [user]);

  if (!user) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-modal w-full max-w-md p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-ink-muted hover:text-ink-body transition"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-mqd-title text-xl font-bold mb-1">{user.name}</h2>
        <p className="text-ink-muted text-sm mb-5">
          Upcoming approved reservations. Requests awaiting a decision appear
          under Requests, not here.
        </p>

        {loading ? (
          <p className="text-ink-muted text-sm text-center py-8">Loading reservations…</p>
        ) : reservations.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CalendarClock className="w-9 h-9 text-mqd-200" />
            <p className="text-ink-muted text-sm">No upcoming reservations.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 max-h-80 overflow-y-auto pr-1">
            {reservations.map((r) => (
              <div key={r.id} className="border border-surface-line rounded-lg p-4 text-sm">
                <p className="font-semibold text-ink">{formatDate(r.date)}</p>
                <p className="text-ink-muted">
                  {formatMinutes(r.startMin)} - {formatMinutes(r.endMin)} &middot; Desk# {r.deskNumber}
                </p>
                {/* Shown so an admin can give someone their code back when
                    they've lost it. Copyable because it usually gets pasted
                    into an email or chat rather than read aloud. */}
                <CopyableCode code={r.confirmationCode} />

                <p className="text-ink-muted text-xs mt-1.5 flex items-center gap-1">
                  <Check className="w-3 h-3 shrink-0" />
                  {r.approvedBy ? `Approved by ${r.approvedBy}` : 'Approved'}
                  {r.approvedAt && ` · ${formatDate(r.approvedAt.split('T')[0])}`}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Roles carry no ranking here — the chip says which kind of account this is, in
// the same slate/amber vocabulary the Requests queue already uses for guests.
const ROLE_STYLES = {
  admin: 'bg-sky-100 text-sky-800',
  guest: 'bg-amber-100 text-amber-800',
  member: 'bg-surface-panel text-ink-body',
};

function MainTab({ users, selectedUserId, onSelectUser }) {
  const [filter, setFilter] = useState('');

  // Name or address, since an admin may have either to hand.
  const term = filter.trim().toLowerCase();
  const shown = term
    ? users.filter((u) =>
        [u.name, u.email].filter(Boolean).some((f) => f.toLowerCase().includes(term))
      )
    : users;

  return (
    <div className="bg-surface-panel border border-surface-line rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-ink ">Users</h1>
        <button
          aria-label="Add user"
          className="w-9 h-9 rounded-lg bg-white border border-surface-line flex items-center justify-center hover:bg-surface-panel transition"
        >
          <Plus className="w-4 h-4 text-ink-body" />
        </button>
      </div>

      <div className="relative mb-4">
        <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search by name or email"
          className="w-full bg-white border border-surface-line rounded-lg pl-9 pr-3 py-2 text-sm text-ink-body focus:outline-none focus:ring-2 focus:ring-mqd-btn"
        />
      </div>

      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Users className="w-9 h-9 text-ink-muted" />
          <p className="text-ink-body text-sm">
            {term ? 'Nothing matches that search.' : 'No users yet.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[28rem] overflow-y-auto pr-1">
          {shown.map((user) => {
            const isSelected = user.id === selectedUserId;
            return (
              <button
                key={user.id}
                onClick={() => onSelectUser(user)}
                className={`bg-white rounded-lg p-3.5 text-left transition hover:bg-surface-panel
                  ${isSelected ? 'ring-2 ring-mqd-btn' : ''}`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-ink">{user.name}</p>
                  <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${ROLE_STYLES[user.role] || 'bg-surface-panel text-ink-body'}`}>
                    {user.role}
                  </span>
                </div>
                <p className="text-ink-muted text-sm mt-0.5">{user.email}</p>
              </button>
            );
          })}
        </div>
      )}

      <p className="text-ink-muted text-xs mt-4">
        Showing {shown.length} of {users.length} user{users.length === 1 ? '' : 's'}.
        {' '}Select someone to see their reservations.
      </p>
    </div>
  );
}

// How long until a pending request lapses, phrased for someone triaging a queue.
const untilExpiry = (expiresAt) => {
  if (!expiresAt) return null;
  const minutes = Math.round((new Date(expiresAt) - Date.now()) / 60000);
  if (minutes <= 0) return 'expiring now';
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h left` : `${Math.round(hours / 24)}d left`;
};

function RequestCard({ request, onDecide, busy }) {
  const isRecurring = request.kind === 'recurring';
  const remaining = untilExpiry(request.expiresAt);

  return (
    <div className="bg-white rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-ink">{request.name}</p>
            {request.role === 'guest' && (
              <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                Guest
              </span>
            )}
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted bg-surface-panel px-2 py-0.5 rounded">
              {isRecurring ? 'Recurring' : 'One-off'}
            </span>
          </div>
          <p className="text-ink-muted text-xs mt-0.5">{request.email}</p>
        </div>
        {remaining && (
          <span className="text-xs text-ink-muted whitespace-nowrap">{remaining}</span>
        )}
      </div>

      <div className="text-sm text-ink-body">
        {isRecurring ? (
          <>
            {/* The span decides whether this is a six-week project or a
                three-month contract, which is most of what the decision rests
                on — one desk of twelve, held for that long. */}
            <p className="text-ink-muted text-xs mb-1">
              {request.activeFrom && (
                <>
                  {shortDay(request.activeFrom)}
                  {' – '}
                  {request.activeUntil ? shortDay(request.activeUntil) : 'open-ended'}
                  {' · '}
                </>
              )}
              Desk# {request.deskNumber} &middot; {request.bookingCount} bookings
            </p>
            {request.pattern.map((p) => (
              <p key={p.day}>
                <span className="font-medium">{p.day}</span>{' '}
                {formatMinutes(p.startMin)} - {formatMinutes(p.endMin)}
              </p>
            ))}
          </>
        ) : (
          <>
            {/* Same reading order as the Reservations tab: when, then where. */}
            <p className="font-medium">{formatDate(request.date)}</p>
            <p className="text-ink-muted">
              {formatMinutes(request.startMin)} - {formatMinutes(request.endMin)}{' '}
              &middot; Desk# {request.deskNumber}
            </p>
            {/* Shown so an admin can quote the code back to whoever is asking,
                without approving first to find it. A recurring request has no
                single code — each generated booking carries its own — so it
                gets a count instead of a number it does not have. */}
            {request.confirmationCode && (
              <p className="font-mono text-xs text-ink-muted mt-1 select-all">
                Confirmation Code: {request.confirmationCode}
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={() => onDecide(request, 'approved')}
          className="flex-1 bg-mqd-btn hover:bg-mqd-btn-hover disabled:opacity-40 text-white text-sm font-semibold py-2 rounded transition flex items-center justify-center gap-1.5"
        >
          <Check className="w-4 h-4" />
          Approve
        </button>
        <button
          disabled={busy}
          onClick={() => onDecide(request, 'denied')}
          className="flex-1 bg-white border border-surface-line hover:bg-surface-panel disabled:opacity-40 text-ink-body text-sm font-semibold py-2 rounded transition flex items-center justify-center gap-1.5"
        >
          <X className="w-4 h-4" />
          Deny
        </button>
      </div>
    </div>
  );
}

function RequestsTab({ requests, loading, error, stale, onDecide, busyId }) {
  if (loading) {
    return (
      <div className="bg-surface-panel border border-surface-line rounded-2xl p-6 min-h-[300px] flex items-center justify-center">
        <p className="text-ink-muted text-sm">Loading requests…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface-panel border border-surface-line rounded-2xl p-6 min-h-[300px] flex items-center justify-center text-center">
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="bg-surface-panel border border-surface-line rounded-2xl p-6 min-h-[300px] flex flex-col items-center justify-center gap-2 text-center">
        <Inbox className="w-10 h-10 text-ink-muted" />
        <h2 className="text-lg font-semibold text-ink-body">Nothing awaiting approval</h2>
        <p className="text-ink-muted text-sm max-w-sm">
          New desk requests appear here. Unanswered requests lapse after 24 hours
          so they don't hold a desk indefinitely.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface-panel border border-surface-line rounded-2xl p-6">
      <h1 className="text-2xl font-bold text-ink mb-5">
        Pending requests
      </h1>

      {/* A background refresh failed, so this list is the last known state
          rather than the current one. Said quietly, because nobody asked for
          the refresh and nothing they did went wrong. */}
      {stale && (
        <p className="text-ink-muted text-sm mb-4">
          Couldn't refresh just now — showing the last known state.
        </p>
      )}
      <div className="flex flex-col gap-3">
        {requests.map((request) => (
          <RequestCard
            key={`${request.kind}-${request.id}`}
            request={request}
            onDecide={onDecide}
            busy={busyId === `${request.kind}-${request.id}`}
          />
        ))}
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState('reservations');
  const [selectedUser, setSelectedUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [usersError, setUsersError] = useState(null);

  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [booking, setBooking] = useState(false);

  // Bumped whenever an admin action changes reservation data. Tabs treat it as
  // a reason to refetch, so a booking made here shows up without the admin
  // having to switch tabs and come back.
  const [dataVersion, setDataVersion] = useState(0);
  const dataChanged = useCallback(() => setDataVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;

    getUsers()
      .then((data) => { if (!cancelled) setUsers(data); })
      .catch((err) => { if (!cancelled) setUsersError(err.message); });

    return () => { cancelled = true; };
  }, []);

  // Loaded on mount rather than on tab switch, so the badge count is visible
  // without the admin having to open the tab first.
  // `background` marks a refresh nobody asked for. A failed poll must not throw
  // away what is on screen: before polling existed this error only appeared when
  // an admin had just done something and was expecting feedback, and one dropped
  // request would now blank the queue they were reading until the next tick.
  //
  // So a background failure keeps the last good data and says so quietly, while a
  // load the admin triggered still reports properly. Either way the next
  // successful fetch clears it.
  const loadRequests = useCallback(({ background = false } = {}) => {
    if (!background) setRequestsError(null);
    return getRequests()
      .then((data) => {
        setRequests(data);
        setRequestsError(null);
        setRefreshFailed(false);
      })
      .catch((err) => {
        if (background) setRefreshFailed(true);
        else setRequestsError(err.message);
      })
      .finally(() => setRequestsLoading(false));
  }, []);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  // Requests arrive from other people, so the queue has to notice them without
  // being asked. A pending request expires — 24 hours, or two hours before the
  // booking starts, whichever comes first — so one nobody sees dies unreviewed,
  // and unlike two admins racing a decision there is no error to catch it.
  //
  // Polling rather than a live connection: one poll is two selects and about ten
  // milliseconds, against a persistent socket for whoever inherits this to
  // operate. Sixty seconds is well inside the shortest review window.
  //
  // It also keeps expiry moving. The sweep only runs when an endpoint is hit, so
  // without this a badge could sit there counting requests that had already
  // lapsed.
  useEffect(() => {
    const poll = () => {
      // A dashboard left open overnight should not keep asking. Hidden tabs
      // resume on the visibility change below.
      if (document.hidden) return;
      loadRequests({ background: true });
    };

    const id = setInterval(poll, REQUEST_POLL_MS);

    // Coming back to the tab should not wait out the rest of the interval.
    const onVisible = () => { if (!document.hidden) loadRequests({ background: true }); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [loadRequests]);

  const handleDecide = async (request, decision) => {
    const key = `${request.kind}-${request.id}`;
    setBusyId(key);
    try {
      await decideRequest(request.kind, request.id, decision);
      await loadRequests();
      // An approval creates reservations and every decision writes a log entry.
      dataChanged();
    } catch (err) {
      setRequestsError(err.message);
      // Another admin may have decided it, or it lapsed — resync either way.
      await loadRequests();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center px-4 md:px-8 py-8 bg-white">
      <div className="w-full max-w-3xl">
        {/* Tabs */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-3 py-2 rounded-t-lg text-sm font-semibold transition
                  ${isActive
                    ? 'bg-surface-line text-ink'
                    : 'bg-surface-panel text-ink-muted hover:bg-surface-panel'}`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.key === 'requests' && requests.length > 0 && (
                  <span className="ml-0.5 bg-mqd-btn text-white text-xs font-bold rounded-full min-w-[1.25rem] h-5 px-1.5 flex items-center justify-center">
                    {requests.length}
                  </span>
                )}
              </button>
            );
          })}

          <button
            onClick={() => setBooking(true)}
            className="ml-auto flex items-center gap-1.5 bg-mqd-btn hover:bg-mqd-btn-hover text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            <CalendarPlus className="w-4 h-4" />
            Book a desk
          </button>
        </div>

        {activeTab === 'reservations' && (
          <ReservationsTab
            dataVersion={dataVersion}
            onChanged={dataChanged}
            onManageSchedules={() => setActiveTab('schedules')}
          />
        )}

        {activeTab === 'users' && (
          usersError ? (
            <div className="bg-surface-panel border border-surface-line rounded-2xl p-6 min-h-[200px] flex items-center justify-center text-center">
              <p className="text-red-600 text-sm">{usersError}</p>
            </div>
          ) : (
            <MainTab users={users} selectedUserId={selectedUser?.id} onSelectUser={setSelectedUser} />
          )
        )}
        {activeTab === 'schedules' && (
          <SchedulesTab dataVersion={dataVersion} onChanged={dataChanged} />
        )}
        {activeTab === 'logs' && <LogsTab dataVersion={dataVersion} />}
        {activeTab === 'requests' && (
          <RequestsTab
            requests={requests}
            loading={requestsLoading}
            error={requestsError}
            stale={refreshFailed}
            onDecide={handleDecide}
            busyId={busyId}
          />
        )}
      </div>

      <UserDetailModal user={selectedUser} onClose={() => setSelectedUser(null)} />

      {booking && (
        <AdminBookingModal
          users={users}
          onClose={() => setBooking(false)}
          onBooked={dataChanged}
        />
      )}
    </div>
  );
}
