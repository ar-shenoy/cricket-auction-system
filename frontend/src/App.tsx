import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Players from './pages/Players';
import Teams from './pages/Teams';
import Auction from './pages/Auction';
import Reports from './pages/Reports';
import LiveViewer from './pages/LiveViewer';
import PublicResults from './pages/PublicResults';
import Scoring from './pages/Scoring';
import Scoreboard from './pages/Scoreboard';
import MatchResult from './pages/MatchResult';
import PointsTable from './pages/PointsTable';
import MatchCentre from './pages/MatchCentre';
import Landing from './pages/Landing';
import RegisterOrg from './pages/RegisterOrg';
import Billing from './pages/Billing';
import Features from './pages/Features';
import TournamentHub from './pages/TournamentHub';
import PublicTournament from './pages/PublicTournament';
import FranchisePortal from './pages/FranchisePortal';
import BroadcastStudio from './pages/BroadcastStudio';
import Intelligence from './pages/Intelligence';
import AuditLog from './pages/AuditLog';
import Health from './pages/Health';
import Promos from './pages/Promos';
import Notifications from './pages/Notifications';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen page-mesh flex items-center justify-center">
        <div className="glass px-6 py-4 text-[14px]" style={{ color: 'var(--text-2)' }}>Loading…</div>
      </div>
    );
  }
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function DeveloperRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen page-mesh flex items-center justify-center">
        <div className="glass px-6 py-4 text-[14px]" style={{ color: 'var(--text-2)' }}>Loading…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'developer') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/welcome" element={<Landing />} />
        <Route path="/register" element={<RegisterOrg />} />
        <Route path="/login" element={<Login />} />

        <Route path="/live" element={<LiveViewer />} />
        <Route path="/results" element={<PublicResults />} />
        <Route path="/scoreboard" element={<Scoreboard />} />
        <Route path="/match-live" element={<MatchCentre />} />
        <Route path="/match/:id" element={<MatchResult />} />
        <Route path="/points" element={<PointsTable />} />
        <Route path="/tournament" element={<PublicTournament />} />

        <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />

        <Route path="/players" element={<PrivateRoute><Players /></PrivateRoute>} />
        <Route path="/teams" element={<PrivateRoute><Teams /></PrivateRoute>} />
        <Route path="/auction" element={<PrivateRoute><Auction /></PrivateRoute>} />
        <Route path="/reports" element={<PrivateRoute><Reports /></PrivateRoute>} />
        <Route path="/scoring" element={<PrivateRoute><Scoring /></PrivateRoute>} />
        <Route path="/hub" element={<PrivateRoute><TournamentHub /></PrivateRoute>} />
        <Route path="/franchise" element={<PrivateRoute><FranchisePortal /></PrivateRoute>} />
        <Route path="/broadcast" element={<PrivateRoute><BroadcastStudio /></PrivateRoute>} />
        <Route path="/intelligence" element={<PrivateRoute><Intelligence /></PrivateRoute>} />
        <Route path="/billing" element={<PrivateRoute><Billing /></PrivateRoute>} />
        <Route path="/notifications" element={<PrivateRoute><Notifications /></PrivateRoute>} />

        <Route path="/features" element={<DeveloperRoute><Features /></DeveloperRoute>} />
        <Route path="/audit" element={<DeveloperRoute><AuditLog /></DeveloperRoute>} />
        <Route path="/health" element={<DeveloperRoute><Health /></DeveloperRoute>} />
        <Route path="/promos" element={<DeveloperRoute><Promos /></DeveloperRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
