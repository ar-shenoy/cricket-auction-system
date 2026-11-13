import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { publicApi, getSocketUrl } from '../services/api';
import { io, Socket } from 'socket.io-client';
import ThemeToggle from '../components/ThemeToggle';

interface Player { id: string; name: string; role?: string; basePrice?: number; photoUrl?: string; city?: string; }
interface Team { id: string; name: string; remainingPurse?: number; logoUrl?: string; }
interface Auction {
  id: string; name: string; status: string; currentPlayerId: string | null; currentBid: number;
  currentBidderTeamId: string | null; currentPlayer?: Player; currentBidderName?: string | null;
}

export default function LiveViewer() {
  const [auction, setAuction] = useState<Auction | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [bidHistory, setBidHistory] = useState<{ id: string; amount: number; teamName?: string }[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const socketRef = useRef<Socket | null>(null);
  const auctionIdRef = useRef<string | null>(null);

  useEffect(() => {
    publicApi.get('/orgs/public-features').then(r => setFeatures(r.data.features || {})).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        try { await fetch(`${getSocketUrl()}/api/health`); } catch {}
        const activeRes = await publicApi.get('/auctions/public/active');
        const active = activeRes.data;
        if (!active?.id) {
          setError('No live auction right now.');
          setLoading(false);
          return;
        }
        if (cancelled) return;
        setAuction(active);
        auctionIdRef.current = active.id;
        setPlayer(active.currentPlayer || null);
        const [teamsRes, bidsRes] = await Promise.all([
          publicApi.get('/teams').catch(() => ({ data: [] })),
          publicApi.get(`/auctions/${active.id}/public/bids`).catch(() => ({ data: [] }))
        ]);
        setTeams(teamsRes.data || []);
        setBidHistory((bidsRes.data || []).slice(0, 30));
        setError('');
      } catch {
        setError('Could not load live auction. Backend may be waking up — refresh in 30s.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!auction?.id) return;
    const socket = io(getSocketUrl(), { transports: ['websocket', 'polling'], reconnection: true });
    socketRef.current = socket;
    socket.emit('join-auction', auction.id);
    socket.on('player-selected', (data: any) => {
      if (data.auction) setAuction(data.auction);
      if (data.player) setPlayer(data.player);
    });
    socket.on('new-bid', (data: any) => {
      if (data.auction) setAuction(data.auction);
      if (data.bid) {
        setBidHistory(prev => [{
          id: data.bid.id,
          amount: Number(data.bid.amount) || 0,
          teamName: data.team?.name
        }, ...prev].slice(0, 30));
      }
    });
    socket.on('player-sold', (data: any) => {
      if (data.auction) setAuction(data.auction);
      setPlayer(null);
      if (data.result?.player) setPlayer(data.result.player);
    });
    socket.on('auction-status', (a: Auction) => setAuction(a));
    socket.on('auction-started', (a: Auction) => setAuction(a));
    socket.on('auction-ended', (a: Auction) => setAuction(a));
    return () => { socket.disconnect(); };
  }, [auction?.id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div style={{ color: 'var(--text-2)' }}>Loading live auction…</div>
      </div>
    );
  }

  if (error && !auction) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6" style={{ background: 'var(--bg)' }}>
        <p style={{ color: 'var(--text-2)' }}>{error}</p>
        <button type="button" className="as-btn-primary" onClick={() => window.location.reload()}>Refresh</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <header className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div>
          <div className="text-[15px] font-semibold">{auction?.name || 'Live Auction'}</div>
          <div className="text-[12px]" style={{ color: 'var(--text-2)' }}>Live · Public View</div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/results" className="text-[13px]" style={{ color: 'var(--accent)' }}>Results</Link>
          <Link to="/results" className="text-[13px]" style={{ color: 'var(--text-2)' }}>Squads & results</Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        <div className="glass p-6">
          {player ? (
            <div className="flex flex-col items-center text-center gap-3 py-2">
              {player.photoUrl ? (
                <img
                  src={player.photoUrl}
                  alt={player.name}
                  className="w-44 h-44 sm:w-56 sm:h-56 md:w-72 md:h-72 rounded-3xl object-cover shadow-xl"
                />
              ) : (
                <div
                  className="w-44 h-44 sm:w-56 sm:h-56 md:w-72 md:h-72 rounded-3xl flex items-center justify-center text-6xl"
                  style={{ background: 'var(--fill)' }}
                >🏏</div>
              )}
              <div className="text-[12px] uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>Now auctioning</div>
              <div className="text-[28px] sm:text-[36px] font-semibold leading-tight">{player.name}</div>
              <div className="text-[14px]" style={{ color: 'var(--text-2)' }}>{player.role}{player.city ? ` · ${player.city}` : ''}</div>
              <div className="text-[44px] sm:text-[56px] font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>
                ₹{Number(auction?.currentBid || 0).toLocaleString()}
              </div>
              <div className="text-[14px]" style={{ color: 'var(--text-2)' }}>
                Leading: <strong style={{ color: 'var(--text)' }}>{auction?.currentBidderName || '—'}</strong>
              </div>
            </div>
          ) : (
            <div className="py-12" style={{ color: 'var(--text-2)' }}>Waiting for next player…</div>
          )}
        </div>

        <div>
          <button type="button" className="glass-island text-[12px]" onClick={() => setShowHistory(h => !h)}>
            Bid history {showHistory ? '▾' : '▸'} ({bidHistory.length})
          </button>
          {showHistory && (
            <div className="glass p-3 mt-2 max-h-48 overflow-y-auto space-y-1">
              {bidHistory.map(b => (
                <div key={b.id} className="flex justify-between text-[13px] px-2 py-1 rounded-lg" style={{ background: 'var(--fill)' }}>
                  <span>{b.teamName || 'Team'}</span>
                  <span className="tabular-nums">₹{Number(b.amount).toLocaleString()}</span>
                </div>
              ))}
              {bidHistory.length === 0 && <div className="text-center text-[13px] py-3" style={{ color: 'var(--text-2)' }}>No bids yet</div>}
            </div>
          )}
        </div>

        {features.liveTeams && teams.length > 0 && (
          <div className="glass p-4">
            <div className="text-[12px] font-medium uppercase mb-2" style={{ color: 'var(--text-2)' }}>Teams</div>
            <div className="grid grid-cols-2 gap-2">
              {teams.map(tm => (
                <div key={tm.id} className="rounded-xl px-3 py-2 text-[13px]" style={{ background: 'var(--fill)' }}>
                  <div className="font-medium truncate">{tm.name}</div>
                  {tm.remainingPurse != null && (
                    <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-2)' }}>₹{Number(tm.remainingPurse).toLocaleString()}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
