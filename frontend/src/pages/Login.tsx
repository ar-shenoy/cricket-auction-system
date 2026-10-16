import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-mesh flex flex-col min-h-screen" style={{ color: 'var(--text)' }}>
      <header className="glass-nav">
        <div className="max-w-md mx-auto px-4 py-3.5 flex items-center justify-between">
          <Link to="/welcome" className="flex items-center gap-2 font-semibold text-[17px]" style={{ color: 'var(--text)' }}>
            <span className="text-[20px]">🏏</span> AuctionScore
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/register" className="text-[14px] font-medium" style={{ color: 'var(--accent)' }}>Sign up</Link>
          </div>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[400px]">
          <div className="text-center mb-8">
            <h1 className="text-[34px] font-semibold tracking-tight leading-tight" style={{ color: 'var(--text)' }}>Welcome back</h1>
            <p className="mt-2 text-[15px]" style={{ color: 'var(--text-2)' }}>Sign in to continue</p>
          </div>

          <div className="glass-thick p-7 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
              {error && (
                <div className="rounded-[14px] px-4 py-3 text-[14px]" style={{ background: 'rgba(255,59,48,0.12)', color: '#ff3b30' }}>{error}</div>
              )}
              <div>
                <label className="as-label">Email</label>
                <input type="email" name="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="as-input" required />
              </div>
              <div>
                <label className="as-label">Password</label>
                <input type="password" name="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="as-input" required />
              </div>
              <button type="submit" disabled={loading} className="as-btn-primary w-full mt-2">{loading ? 'Signing in…' : 'Sign in'}</button>
            </form>
            <p className="text-center text-[14px] mt-6" style={{ color: 'var(--text-2)' }}>
              New? <Link to="/register" className="font-medium" style={{ color: 'var(--accent)' }}>Create organization</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
