import React from 'react';
import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="page-mesh min-h-screen" style={{ color: 'var(--text)' }}>
      <header className="glass-nav">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <Link to="/welcome" className="as-brand">
            <span className="as-brand-mark" aria-hidden>🏏</span>
            <span>AuctionScore</span>
          </Link>
          <Link to="/login" className="as-btn-primary !py-1.5 !px-4 text-[14px]">
            Sign in
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-16 sm:py-24">
        <div className="text-center mb-14" style={{ animation: 'as-rise 0.6s cubic-bezier(0.22,1,0.36,1) both' }}>
          <div
            className="inline-block px-2.5 py-1 text-[11px] font-extrabold tracking-[0.14em] uppercase mb-4"
            style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
          >
            Invitation only
          </div>
          <h1
            className="text-[40px] sm:text-[56px] font-black leading-[0.95] tracking-tight uppercase m-0"
            style={{ color: 'var(--accent)', textShadow: '0 0 40px rgba(255,230,0,0.2)' }}
          >
            Cricket auction
            <br />
            control room
          </h1>
          <p className="text-[16px] sm:text-[18px] mt-4 max-w-xl mx-auto" style={{ color: 'var(--text-2)' }}>
            Live player auctions, scoring, franchise portals, and broadcast tools — provisioned by your platform team.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Link to="/login" className="as-btn-primary !px-6 !py-3 text-[16px]">
              Sign in
            </Link>
            <a href="/live" className="as-btn-ghost !px-6 !py-3 text-[16px]">
              Watch live
            </a>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { t: 'Auction desk', d: 'Bids, timers, sold cards, purse tracking — projector-ready focus mode.' },
            { t: 'Scoring & board', d: 'Match events, points table, public scoreboard and match centre.' },
            { t: 'Franchise tools', d: 'Captain view, reports, intel, WhatsApp sold alerts when enabled.' }
          ].map((c, i) => (
            <div
              key={c.t}
              className="glass p-5"
              style={{ animation: `as-rise 0.5s cubic-bezier(0.22,1,0.36,1) ${0.1 + i * 0.06}s both` }}
            >
              <div className="as-section-title">{c.t}</div>
              <p className="text-[14px] m-0 mt-2" style={{ color: 'var(--text-2)' }}>{c.d}</p>
            </div>
          ))}
        </div>

        <p className="text-center text-[13px] mt-12" style={{ color: 'var(--text-3)' }}>
          Accounts are created by the platform developer — no public self-signup.
        </p>
      </main>
    </div>
  );
}
