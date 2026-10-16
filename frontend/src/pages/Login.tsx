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
    <div className="min-h-screen page-mesh flex flex-col text-[var(--text-primary)]">
      <header className="glass-nav">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/welcome" className="flex items-center gap-2 font-semibold text-[17px]">
            <span className="text-xl">🏏</span> AuctionScore
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/register" className="text-sm text-[var(--accent)] font-medium hover:underline">Sign up</Link>
          </div>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--text-primary)]">Welcome back</h1>
            <p className="mt-2 text-[var(--text-secondary)] text-[15px]">Sign in to run auctions and live scoring</p>
          </div>
          <div className="glass rounded-[28px] p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
              {error && (
                <div className="rounded-2xl px-4 py-3 text-sm bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">{error}</div>
              )}
              <div>
                <label className="as-label">Email</label>
                <input type="email" name="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="as-input" required />
              </div>
              <div>
                <label className="as-label">Password</label>
                <input type="password" name="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="as-input" required />
              </div>
              <button type="submit" disabled={loading} className="as-btn-primary w-full disabled:opacity-50">{loading ? 'Signing in…' : 'Sign in'}</button>
            </form>
            <p className="text-center text-sm text-[var(--text-secondary)] mt-6">
              New organizer? <Link to="/register" className="text-[var(--accent)] font-medium hover:underline">Create organization</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
