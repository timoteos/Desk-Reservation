import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';

// Routes that are a screen rather than a page. A reception display has one job
// and every pixel spent on site furniture — contact details, an FAQ link, a
// copyright line — is a pixel not spent on the floor plan somebody is trying to
// read from a few paces away.
const KIOSK_ROUTES = ['/front-desk'];

export default function Layout() {
  const { pathname } = useLocation();
  const kiosk = KIOSK_ROUTES.includes(pathname);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header />
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>
      {!kiosk && <Footer />}
    </div>
  );
}
