import React from 'react';
import { Link } from 'react-router-dom';

/** Public self-signup is closed. Developer provisions organisers. */
export default function RegisterOrg() {
  return (
    <div className="page-mesh min-h-screen flex flex-col" style={{ color: 'var(--text)' }}>
      <header className="glass-nav">
        <div className="max-w-md mx-auto px-4 py-3.5 flex items-center justify-between">
          <Link to="/welcome" className="as-brand">
            <span className="as-brand-mark" aria-hidden>🏏</span>
            <span>AuctionScore</span>
          </Link>
          <Link to="/login" className="as-nav-link is-active">Login</Link>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="glass p-6 sm:p-8 max-w-md w-full text-center">
          <div
            className="inline-block px-2.5 py-1 text-[11px] font-extrabold tracking-[0.12em] uppercase mb-4"
            style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
          >
            Access closed
          </div>
          <h1 className="text-[26px] font-black tracking-tight uppercase m-0" style={{ color: 'var(--text)' }}>
            No public signup
          </h1>
          <p className="text-[14px] mt-3 mb-6" style={{ color: 'var(--text-2)' }}>
            Organiser accounts are created and managed by the platform team.
            If you run a league, ask them for a login — they set your email, password, and access window.
          </p>
          <Link to="/login" className="as-btn-primary w-full inline-block text-center">
            Go to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
