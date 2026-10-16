import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicApi } from '../services/api';
import ThemeToggle from '../components/ThemeToggle';

export default function Landing() {
  const [plans, setPlans] = useState<any[]>([]);
  useEffect(() => {
    publicApi.get('/orgs/plans').then(r => setPlans(r.data || [])).catch(() => {
      setPlans([
        { id: 'free', name: 'Free', priceInr: 0 },
        { id: 'pro', name: 'Pro', priceInr: 1499 }
      ]);
    });
  }, []);
  const pro = plans.find(p => p.id === 'pro');

  return (
    <div className="min-h-screen page-mesh text-[var(--text-primary)]">
      <header className="glass-nav sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-[17px]">
            <span className="text-xl">🏏</span> AuctionScore
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <Link to="/login" className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2">Login</Link>
            <Link to="/register" className="as-btn-primary text-sm !py-1.5 !px-4">Start free</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="max-w-5xl mx-auto px-4 py-16 sm:py-24 text-center">
          <p className="text-[var(--accent)] text-sm font-semibold tracking-wide mb-3">Cricket auction + live scoring</p>
          <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight leading-[1.1] text-[var(--text-primary)]">
            Run your league<br /><span className="text-[var(--accent)]">like a pro</span>
          </h1>
          <p className="mt-6 text-lg text-[var(--text-secondary)] max-w-2xl mx-auto">
            Player registration, live bidding, purse tracking, ball-by-ball scoring, and projector boards.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/register" className="as-btn-primary text-base !px-6 !py-3">Create organization — free</Link>
            <Link to="/login" className="as-btn-ghost text-base !px-6 !py-3">Login</Link>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-4 pb-16 grid sm:grid-cols-3 gap-4">
          {[
            { t: 'Live auction', d: 'Real-time bids, purse limits, public viewer.' },
            { t: 'Match scoring', d: 'Runs, extras, FOW, projector board.' },
            { t: 'Tournament ready', d: 'Points table, results, PDF scorecards.' }
          ].map(f => (
            <div key={f.t} className="glass rounded-[22px] p-6 text-left">
              <h3 className="font-semibold text-[17px] text-[var(--text-primary)] mb-2">{f.t}</h3>
              <p className="text-sm text-[var(--text-secondary)]">{f.d}</p>
            </div>
          ))}
        </section>

        <section className="max-w-4xl mx-auto px-4 pb-20">
          <h2 className="text-3xl font-semibold text-center text-[var(--text-primary)] mb-2">Simple pricing</h2>
          <p className="text-center text-[var(--text-secondary)] mb-10">Start free. Upgrade when you need more.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="glass rounded-[22px] p-6">
              <div className="text-sm text-[var(--text-secondary)]">Free</div>
              <div className="text-4xl font-semibold mt-1 text-[var(--text-primary)]">₹0</div>
              <ul className="mt-6 space-y-2 text-sm text-[var(--text-secondary)]">
                <li>1 tournament · 8 teams · 120 players</li>
                <li>Live scoreboard & points</li>
                <li>Photos cleared after 15 days</li>
              </ul>
              <Link to="/register" className="as-btn-ghost mt-6 inline-block text-center w-full">Get started</Link>
            </div>
            <div className="glass rounded-[22px] p-6 ring-2 ring-[var(--accent)]/30">
              <div className="text-sm text-[var(--accent)] font-medium">Pro</div>
              <div className="text-4xl font-semibold mt-1 text-[var(--text-primary)]">
                ₹{pro?.priceInr ?? 1499}
                <span className="text-base font-normal text-[var(--text-secondary)]"> / 90 days</span>
              </div>
              <ul className="mt-6 space-y-2 text-sm text-[var(--text-secondary)]">
                <li>Higher limits · branding-ready</li>
                <li>Priority for live events</li>
                <li>Full history retention</li>
              </ul>
              <Link to="/register" className="as-btn-primary mt-6 inline-block text-center w-full">Start free, upgrade later</Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
