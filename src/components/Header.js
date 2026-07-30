import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Lock, LogOut, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Inside the admin area the title is plain text — making it a home link there
// is what stranded admins on the public side in the first place.
function TitleWrapper({ inAdminArea, children }) {
  if (inAdminArea) {
    return <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">{children}</div>;
  }
  return (
    <Link
      to="/"
      aria-label="MQD Desk Reservation Systems Office — home"
      className="flex items-center gap-3 md:gap-4 flex-1 min-w-0 rounded-lg group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mqd-btn"
    >
      {children}
    </Link>
  );
}

export default function Header() {
  const { admin, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // On the login page the button would link to the page you're already on.
  // The breadcrumb there still offers the way back.
  const onLoginPage = pathname === '/admin/login';
  // Reflects where you are, not who you are — a signed-in admin on the landing
  // page should still see the site's name, not "Admin Dashboard".
  const inAdminArea = pathname.startsWith('/admin');

  const handleSignOut = () => {
    signOut();
    navigate('/');
  };

  return (
    <header className="bg-white border-t-4 border-blue-400 px-4 md:px-6 py-3 flex items-center gap-3 md:gap-4">
      {/* Logos and title are one link home — the convention people reach for
          without being told, and it works on every page. */}
      <TitleWrapper inAdminArea={inAdminArea}>
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <img src={`${process.env.PUBLIC_URL}/logos/dhs.png`} alt="DHS Seal" className="w-10 h-10 md:w-14 md:h-14 object-contain" onError={(e) => { e.target.style.display='none'; }} />
          <img src={`${process.env.PUBLIC_URL}/logos/soh.png`} alt="State of Hawaii Seal" className="w-10 h-10 md:w-14 md:h-14 object-contain" onError={(e) => { e.target.style.display='none'; }} />
          <img src={`${process.env.PUBLIC_URL}/logos/mqd.png`} alt="MQD Logo" className="w-10 h-10 md:w-14 md:h-14 object-contain" onError={(e) => { e.target.style.display='none'; }} />
        </div>
        <h1 className={`text-lg md:text-3xl font-extrabold text-mqd-title leading-tight ${inAdminArea ? '' : 'group-hover:text-mqd-btn-hover transition-colors'}`}>
          {inAdminArea ? 'Admin Dashboard' : 'MQD Desk Reservation Systems Office'}
        </h1>
      </TitleWrapper>
      {admin ? (
        <div className="flex items-center gap-2 shrink-0">
          {/* Name is supporting detail, so it drops first on narrow screens. */}
          <span className="hidden lg:flex items-center gap-1.5 text-sm text-ink-muted max-w-[10rem] truncate">
            <UserRound className="w-3.5 h-3.5 shrink-0" />
            {admin.name}
          </span>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-sm font-medium text-mqd-title bg-mqd-title/5 border border-mqd-title/30 rounded-full px-3 py-1.5 hover:bg-mqd-title/15 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      ) : onLoginPage ? null : (
        <Link
          to="/admin/login"
          className="flex items-center gap-1.5 text-sm font-medium text-mqd-title border border-mqd-title/30 rounded-full px-3 py-1.5 hover:bg-mqd-title/10 transition shrink-0"
        >
          <Lock className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Admin Login</span>
        </Link>
      )}
    </header>
  );
}
