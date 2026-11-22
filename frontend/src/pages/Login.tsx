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
          <Link to="/welcome" className="as-brand">
            <span className="as-brand-mark" aria-hidden>🏏</span>
            <span>AuctionScore</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/register" className="as-nav-link is-active">Sign up</Link>
          </div>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-8">
            <div
              className="inline-block px-2.5 py-1 text-[11px] font-extrabold tracking-[0.14em] uppercase mb-3"
              style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
            >
              Live now
            </div>
            <h1
              className="text-[42px] sm:text-[52px] font-black leading-[0.92] tracking-tight uppercase"
              style={{ color: 'var(--accent)' }}
            >
              Player<br />Auction
            </h1>
          </div>

          <div
            className="p-6 sm:p-8"
            style={{
              background: '#0e0e0e',
              border: '1px solid rgba(255,255,255,0.1)',
              borderTop: '3px solid var(--accent)',
              borderRadius: 12,
              boxShadow: '0 24px 60px rgba(0,0,0,0.55)'
            }}
          >
            <h2
              className="text-[28px] font-black tracking-tight uppercase m-0"
              style={{ color: 'var(--text)' }}
            >
              Sign in
            </h2>
            <div
              style={{
                width: 48,
                height: 3,
                background: 'var(--accent)',
                margin: '0.55rem 0 1rem'
              }}
            />
            <p className="text-[14px] m-0 mb-6" style={{ color: 'var(--text-2)' }}>
              Follow the auction live. Captains bid from here.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
              {error && (
                <div
                  className="px-4 py-3 text-[13px] font-semibold rounded-md"
                  style={{
                    background: 'rgba(255,59,59,0.12)',
                    color: 'var(--danger)',
                    border: '1px solid rgba(255,59,59,0.35)'
                  }}
                >
                  {error}
                </div>
              )}
              <div>
                <label className="as-label">Email</label>
                <input
                  type="email"
                  name="email"
                  autoComplete="username"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="as-input"
                  required
                />
              </div>
              <div>
                <label className="as-label">Password</label>
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="as-input"
                  required
                />
              </div>
              <button type="submit" disabled={loading} className="as-btn-primary w-full mt-1">
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <p
              className="text-center text-[12px] font-bold tracking-[0.08em] uppercase mt-6 mb-0"
              style={{ color: 'var(--text-3)' }}
            >
              New here?{' '}
              <Link to="/register" style={{ color: 'var(--accent)' }}>
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
