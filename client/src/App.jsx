import { Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header';
import LoginAnnouncementPopup from './components/LoginAnnouncementPopup';
import SchedulePopupManager from './components/SchedulePopupManager';
import SiteFooter from './components/SiteFooter';
import ProtectedRoute from './components/ProtectedRoute';
import ShabbatGate from './components/ShabbatGate';
import Login from './pages/Login';
import Home from './pages/Home';
import Rate from './pages/Rate';
import Batches from './pages/Batches';
import SchedulePrizes from './pages/SchedulePrizes';
import Prizes from './pages/Prizes';
import Products from './pages/Products';
import Battles from './pages/Battles';
import GuessGroups from './pages/GuessGroups';
import GuessGroupDetail from './pages/GuessGroupDetail';
import CoinBets from './pages/CoinBets';
import Leaderboard from './pages/Leaderboard';
import Admin from './pages/Admin';
import Profile from './pages/Profile';

export default function App() {
  return (
    <ShabbatGate>
      <div className="app-topbar">
        <Header />
      </div>
      <LoginAnnouncementPopup />
      <SchedulePopupManager />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/rate" element={<ProtectedRoute allowGuest><Rate /></ProtectedRoute>} />
        <Route path="/batches" element={<ProtectedRoute><Batches /></ProtectedRoute>} />
        <Route path="/schedule" element={<ProtectedRoute><SchedulePrizes /></ProtectedRoute>} />
        <Route path="/prizes" element={<ProtectedRoute><Prizes /></ProtectedRoute>} />
        <Route path="/products" element={<ProtectedRoute><Products /></ProtectedRoute>} />
        <Route path="/battles" element={<ProtectedRoute><Battles /></ProtectedRoute>} />
        <Route path="/guess-groups" element={<ProtectedRoute requireGuessGroups><GuessGroups /></ProtectedRoute>} />
        <Route path="/guess-groups/:id" element={<ProtectedRoute requireGuessGroups><GuessGroupDetail /></ProtectedRoute>} />
        <Route path="/coin-bets" element={<ProtectedRoute><CoinBets /></ProtectedRoute>} />
        <Route path="/leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute staffOnly><Admin /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <SiteFooter />
    </ShabbatGate>
  );
}
