import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import LandingPage from './pages/LandingPage';
import ReservationPage from './pages/ReservationPage';
import CalendarPage from './pages/CalendarPage';
import DeskSelectionPage from './pages/DeskSelectionPage';
import UserConfirmationPage from './pages/UserConfirmationPage';
import AdminLoginPage from './pages/AdminLoginPage';
import ConfirmationCodePage from './pages/ConfirmationCodePage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import RecurringSchedulePage from './pages/RecurringSchedulePage';
import RequireAdmin from './components/RequireAdmin';

export default function App() {
  return (
    <BrowserRouter basename={process.env.PUBLIC_URL}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/reservation" element={<ReservationPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/desk-selection" element={<DeskSelectionPage />} />
          <Route path="/request" element={<UserConfirmationPage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/confirmation-code" element={<ConfirmationCodePage />} />
          <Route
            path="/admin/dashboard"
            element={
              <RequireAdmin>
                <AdminDashboardPage />
              </RequireAdmin>
            }
          />
          <Route path="/recurring-schedule" element={<RecurringSchedulePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
