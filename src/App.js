import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import LandingPage from './pages/LandingPage';
import ReservationPage from './pages/ReservationPage';
import CalendarPage from './pages/CalendarPage';
import DeskSelectionPage from './pages/DeskSelectionPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/reservation" element={<ReservationPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/desk-selection" element={<DeskSelectionPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
