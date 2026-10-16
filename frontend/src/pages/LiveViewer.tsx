import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { publicApi, getSocketUrl } from '../services/api';
import { startKeepAliveInterval } from '../utils/keepAlive';
import { io, Socket } from 'socket.io-client';

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
        publicApi.get('/auctions/public/current').catch(() =>
          publicApi.get('/auctions').then(r => ({
            data: (r.data || []).find((x: any) => x.status === 'live') || r.data?.[0]
          }))
        ),
        publicApi.get('/teams')
      ]);
      const a = aRes.data;
      setAuction(a || null);
      setTeams(tRes.data || []);
      if (a?.currentPlayer) setCurrent(a.currentPlayer);
      if (a?.currentBid) setLastBid(a.currentBid);
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
      socket.on('connect', () => {
        if (auction?.id) socket?.emit('join-auction', auction.id);
      });
      socket.on('player-up', (p: Player) => setCurrent(p));
      socket.on('new-bid', (b: any) => setLastBid(b));
      socket.on('player-sold', () => load());
      socket.on('auction-update', () => load());
    } catch {}
    return () => {
      clearInterval(t);
      socket?.disconnect();
    };
  }, [load, auction?.id]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 sticky top-0 z-40 bg-slate-950/90 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Link to="/welcome" className="text-2xl">🏏</Link>
            <div className="min-w-0">
              <div className="text-xs text-slate-500 uppercase tracking-wide">Live auction</div>
              <h1 className="font-bold truncate">{auction?.name || 'Auction'}</h1>
            </div>
          </div>
          <div className="flex gap-3 text-sm shrink-0">
            <Link to="/results" className="text-slate-400 hover:text-indigo-400">Results</Link>
            <Link to="/points" className="text-slate-400 hover:text-purple-400">Points</Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {loading && <p className="text-center text-slate-500">Loading…</p>}
        {!loading && !auction && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center text-slate-400">
            No live auction right now.
          </div>
        )}
        {current && (
          <div className="bg-gradient-to-br from-indigo-950/80 to-slate-900 border border-indigo-800/50 rounded-2xl p-6 sm:p-8 text-center">
            {current.photoUrl && (
              <img src={current.photoUrl} alt="" className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl object-cover mx-auto mb-4 border-2 border-indigo-500/40" />
            )}
            <div className="text-xs text-indigo-400 uppercase tracking-widest mb-1">On the block</div>
            <h2 className="text-3xl sm:text-4xl font-black">{current.name}</h2>
            <p className="text-slate-400 mt-1">{current.role || 'Player'}</p>
            {current.basePrice != null && (
              <p className="text-sm text-slate-500 mt-2">Base ₹{Number(current.basePrice).toLocaleString()}</p>
            )}
            {lastBid?.amount != null && (
              <div className="mt-6 inline-block bg-slate-950/80 border border-slate-700 rounded-xl px-6 py-3">
                <div className="text-xs text-slate-500 uppercase">Current bid</div>
                <div className="text-3xl font-black text-amber-400 tabular-nums">
                  ₹{Number(lastBid.amount).toLocaleString()}
                </div>
                {lastBid.teamName && <div className="text-sm text-slate-300 mt-1">{lastBid.teamName}</div>}
              </div>
            )}
          </div>
        )}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="font-bold mb-4 text-slate-200">Team purses</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {teams.map(t => (
              <div key={t.id} className="flex items-center gap-3 bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2.5">
                {t.logoUrl ? (
                  <img src={t.logoUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <span className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center">🏏</span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{t.name}</div>
                  <div className="text-sm text-emerald-400 tabular-nums">
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
