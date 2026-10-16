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
import Landing from './pages/Landing';
import RegisterOrg from './pages/RegisterOrg';
import Billing from './pages/Billing';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/welcome" element={<Landing />} />
        <Route path="/register" element={<RegisterOrg />} />
        <Route path="/login" element={<Login />} />
        {/* Public pages */}
        <Route path="/live" element={<LiveViewer />} />
        <Route path="/results" element={<PublicResults />} />
        <Route path="/scoreboard" element={<Scoreboard />} />
        <Route path="/match/:id" element={<MatchResult />} />
        <Route path="/points" element={<PointsTable />} />
        <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/players" element={<PrivateRoute><Players /></PrivateRoute>} />
        <Route path="/teams" element={<PrivateRoute><Teams /></PrivateRoute>} />
        <Route path="/auction" element={<PrivateRoute><Auction /></PrivateRoute>} />
        <Route path="/reports" element={<PrivateRoute><Reports /></PrivateRoute>} />
        <Route path="/scoring" element={<PrivateRoute><Scoring /></PrivateRoute>} />
        <Route path="/billing" element={<PrivateRoute><Billing /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
