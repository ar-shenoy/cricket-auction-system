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
    <div className="page-mesh min-h-screen" style={{ color: 'var(--text)' }}>
      <header className="glass-nav">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-[17px]">
            <span className="text-[20px]">🏏</span> AuctionScore
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <Link to="/login" className="text-[14px] font-medium px-2" style={{ color: 'var(--text-2)' }}>Login</Link>
            <Link to="/register" className="as-btn-primary !py-1.5 !px-4 text-[14px]">Start free</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="max-w-5xl mx-auto px-4 py-16 sm:py-24 text-center">
          <div className="glass-island mx-auto mb-6">Cricket auction + live scoring</div>
          <h1 className="text-[40px] sm:text-[56px] font-semibold tracking-tight leading-[1.05]" style={{ color: 'var(--text)' }}>
            Run your league<br /><span style={{ color: 'var(--accent)' }}>like a pro</span>
          </h1>
          <p className="mt-5 text-[17px] max-w-xl mx-auto" style={{ color: 'var(--text-2)' }}>
            Player registration, live bidding, purse tracking, ball-by-ball scoring, and projector boards.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/register" className="as-btn-primary !px-6 !py-3 text-[16px]">Create organization — free</Link>
            <Link to="/login" className="as-btn-ghost !px-6 !py-3 text-[16px]">Login</Link>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-4 pb-16 grid sm:grid-cols-3 gap-3.5">
          {[
            { t: 'Live auction', d: 'Real-time bids, purse limits, public viewer.' },
            { t: 'Match scoring', d: 'Runs, extras, FOW, projector board.' },
            { t: 'Tournament ready', d: 'Points table, results, PDF scorecards.' }
          ].map(f => (
            <div key={f.t} className="glass p-6 text-left">
              <h3 className="font-semibold text-[17px] mb-2" style={{ color: 'var(--text)' }}>{f.t}</h3>
              <p className="text-[14px]" style={{ color: 'var(--text-2)' }}>{f.d}</p>
            </div>
          ))}
        </section>

        <section className="max-w-4xl mx-auto px-4 pb-20">
          <h2 className="text-[28px] font-semibold text-center mb-1" style={{ color: 'var(--text)' }}>Simple pricing</h2>
          <p className="text-center text-[15px] mb-10" style={{ color: 'var(--text-2)' }}>Start free. Upgrade when you need more.</p>
          <div className="grid sm:grid-cols-2 gap-3.5">
            <div className="glass p-6">
              <div className="text-[13px]" style={{ color: 'var(--text-2)' }}>Free</div>
              <div className="text-[40px] font-semibold mt-1" style={{ color: 'var(--text)' }}>₹0</div>
              <ul className="mt-5 space-y-2 text-[14px]" style={{ color: 'var(--text-2)' }}>
                <li>1 tournament · 8 teams · 120 players</li>
                <li>Live scoreboard & points</li>
                <li>Photos cleared after 15 days</li>
              </ul>
              <Link to="/register" className="as-btn-ghost mt-6 w-full text-center">Get started</Link>
            </div>
            <div className="glass-thick p-6" style={{ boxShadow: 'var(--shadow-glass), 0 0 0 1.5px color-mix(in srgb, var(--accent) 40%, transparent)' }}>
              <div className="text-[13px] font-medium" style={{ color: 'var(--accent)' }}>Pro</div>
              <div className="text-[40px] font-semibold mt-1" style={{ color: 'var(--text)' }}>
                ₹{pro?.priceInr ?? 1499}
                <span className="text-[15px] font-normal" style={{ color: 'var(--text-2)' }}> / 90 days</span>
              </div>
              <ul className="mt-5 space-y-2 text-[14px]" style={{ color: 'var(--text-2)' }}>
                <li>Higher limits · branding-ready</li>
                <li>Priority for live events</li>
                <li>Full history retention</li>
              </ul>
              <Link to="/register" className="as-btn-primary mt-6 w-full text-center">Start free, upgrade later</Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
