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
        <Route path="/login" element={<Login />} />
        {/* Public pages – no login required */}
        <Route path="/live" element={<LiveViewer />} />
        <Route path="/results" element={<PublicResults />} />
        <Route path="/scoreboard" element={<Scoreboard />} />
        <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/players" element={<PrivateRoute><Players /></PrivateRoute>} />
        <Route path="/teams" element={<PrivateRoute><Teams /></PrivateRoute>} />
        <Route path="/auction" element={<PrivateRoute><Auction /></PrivateRoute>} />
        <Route path="/reports" element={<PrivateRoute><Reports /></PrivateRoute>} />
        <Route path="/scoring" element={<PrivateRoute><Scoring /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
