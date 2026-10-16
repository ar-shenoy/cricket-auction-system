import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicApi } from '../services/api';

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
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg"><span className="text-2xl">🏏</span> AuctionScore</div>
          <div className="flex gap-3 text-sm">
            <Link to="/login" className="text-slate-300 hover:text-white px-3 py-1.5">Login</Link>
            <Link to="/register" className="bg-indigo-600 hover:bg-indigo-500 px-4 py-1.5 rounded-lg font-medium">Start free</Link>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-16 text-center">
        <p className="text-indigo-400 text-sm font-semibold uppercase tracking-widest mb-3">Cricket auction + live scoring</p>
        <h1 className="text-4xl sm:text-6xl font-black tracking-tight">Run your league auction<br /><span className="text-indigo-400">like a pro</span></h1>
        <p className="mt-6 text-lg text-slate-400 max-w-2xl mx-auto">Player registration, live bidding, purse tracking, ball-by-ball scoring, projector scoreboard and points table.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/register" className="bg-indigo-600 hover:bg-indigo-500 px-6 py-3 rounded-xl font-semibold text-lg">Create organization — free</Link>
          <Link to="/login" className="border border-slate-600 px-6 py-3 rounded-xl font-semibold text-lg">Login</Link>
        </div>
        <div className="mt-16 grid sm:grid-cols-2 gap-6 text-left">
          <div className="rounded-2xl border border-slate-700 p-6">
            <div className="text-sm text-slate-400 uppercase">Free</div>
            <div className="text-4xl font-black mt-1">₹0</div>
            <ul className="mt-4 space-y-1 text-sm text-slate-300">
              <li>✓ 1 tournament · 8 teams · 120 players</li>
              <li>✓ Live scoreboard & points</li>
              <li>✓ Photos cleared after 15 days</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-indigo-500 bg-indigo-950/40 p-6">
            <div className="text-sm text-indigo-300 uppercase">Pro</div>
            <div className="text-4xl font-black mt-1">₹{pro?.priceInr ?? 1499}<span className="text-base font-normal text-slate-400"> / 90 days</span></div>
            <ul className="mt-4 space-y-1 text-sm text-slate-200">
              <li>✓ Higher limits</li>
              <li>✓ Branding-ready</li>
              <li>✓ Full history</li>
            </ul>
            <Link to="/register" className="mt-4 inline-block bg-indigo-600 px-4 py-2 rounded-lg text-sm font-medium">Start free, upgrade later</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
