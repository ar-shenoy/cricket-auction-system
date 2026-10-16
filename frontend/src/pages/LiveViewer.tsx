import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { publicApi, getSocketUrl } from '../services/api';
import { startKeepAliveInterval } from '../utils/keepAlive';
import { io, Socket } from 'socket.io-client';
import ThemeToggle from '../components/ThemeToggle';

interface Player {
  id: string;
  name: string;
  role?: string;
  photoUrl?: string;
  basePrice?: number;
}

interface Team {
  id: string;
  name: string;
  remainingPurse?: number;
  purse?: number;
  logoUrl?: string;
}

export default function LiveViewer() {
  const [auction, setAuction] = useState<any>(null);
  const [current, setCurrent] = useState<Player | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [lastBid, setLastBid] = useState<{ teamName?: string; amount?: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [aRes, tRes] = await Promise.all([
        publicApi.get('/auctions/public/active').catch(() => ({ data: null })),
        publicApi.get('/teams')
      ]);
      const a = aRes.data;
      setAuction(a || null);
      setTeams(tRes.data || []);
      if (a?.currentPlayer) setCurrent(a.currentPlayer);
      if (a?.currentBid != null) setLastBid({ amount: a.currentBid, teamName: a.currentBidderName });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    startKeepAliveInterval();
    const t = setInterval(load, 8000);
    let socket: Socket | null = null;
    try {
      socket = io(getSocketUrl(), { transports: ['websocket', 'polling'] });
      socket.on('player-up', (p: Player) => setCurrent(p));
      socket.on('new-bid', (b: any) => setLastBid(b));
      socket.on('player-sold', () => load());
      socket.on('auction-update', () => load());
    } catch {}
    return () => {
      clearInterval(t);
      socket?.disconnect();
    };
  }, [load]);

  return (
    <div className="min-h-screen page-mesh text-[var(--text-primary)]">
      <header className="glass-nav sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Link to="/welcome" className="text-xl">🏏</Link>
            <div className="min-w-0">
              <div className="text-xs text-[var(--text-secondary)] uppercase tracking-wide">Live auction</div>
              <h1 className="font-semibold truncate text-[var(--text-primary)]">{auction?.name || 'Auction'}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm shrink-0">
            <ThemeToggle />
            <Link to="/results" className="text-[var(--text-secondary)] hover:text-[var(--accent)]">Results</Link>
            <Link to="/points" className="text-[var(--text-secondary)] hover:text-[var(--accent)]">Points</Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-5">
        {loading && <p className="text-center text-[var(--text-secondary)]">Loading…</p>}
        {!loading && !auction && (
          <div className="glass rounded-[22px] p-10 text-center text-[var(--text-secondary)]">No live auction right now.</div>
        )}
        {current && (
          <div className="glass rounded-[28px] p-6 sm:p-8 text-center">
            {current.photoUrl && (
              <img src={current.photoUrl} alt="" className="w-28 h-28 sm:w-32 sm:h-32 rounded-[22px] object-cover mx-auto mb-4 ring-2 ring-[var(--accent)]/30" />
            )}
            <div className="text-xs text-[var(--accent)] font-semibold uppercase tracking-widest mb-1">On the block</div>
            <h2 className="text-3xl sm:text-4xl font-semibold text-[var(--text-primary)]">{current.name}</h2>
            <p className="text-[var(--text-secondary)] mt-1">{current.role || 'Player'}</p>
            {lastBid?.amount != null && (
              <div className="mt-6 inline-block glass-strong rounded-2xl px-6 py-3">
                <div className="text-xs text-[var(--text-secondary)] uppercase">Current bid</div>
                <div className="text-3xl font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                  ₹{Number(lastBid.amount).toLocaleString()}
                </div>
                {lastBid.teamName && <div className="text-sm text-[var(--text-secondary)] mt-1">{lastBid.teamName}</div>}
              </div>
            )}
          </div>
        )}
        <div className="glass rounded-[22px] p-5">
          <h3 className="font-semibold mb-4 text-[var(--text-primary)]">Team purses</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {teams.map(t => (
              <div key={t.id} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 bg-black/5 dark:bg-white/5">
                {t.logoUrl ? (
                  <img src={t.logoUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <span className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center">🏏</span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate text-[var(--text-primary)]">{t.name}</div>
                  <div className="text-sm text-emerald-600 dark:text-emerald-400 tabular-nums">
                    ₹{Number(t.remainingPurse ?? t.purse ?? 0).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
