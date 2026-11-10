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
    const poll = setInterval(load, 12000);

    const socket = io(getSocketUrl(), { transports: ['websocket', 'polling'], reconnection: true });
    socketRef.current = socket;
    socket.on('connect', () => {
      if (auctionIdRef.current) socket.emit('join-auction', auctionIdRef.current);
    });
    socket.on('player-selected', (data: any) => {
      if (data.auction) setAuction(data.auction);
      if (data.player) setPlayer(data.player);
    });
    socket.on('new-bid', (data: any) => {
      if (data.auction) setAuction(data.auction);
      if (data.bid) {
        setBidHistory(h => [{
          id: data.bid.id,
          amount: Number(data.bid.amount) || 0,
          teamName: data.team?.name
        }, ...h].slice(0, 30));
      }
    });
    socket.on('player-sold', (data: any) => {
      if (data.auction) setAuction(data.auction);
      if (data.result?.status !== 'Undone') setPlayer(null);
      else if (data.result?.player) setPlayer(data.result.player);
    });
    socket.on('auction-status', (data: any) => {
      if (data?.id) setAuction(data);
      else if (data?.auction) setAuction(data.auction);
    });

    return () => {
      cancelled = true;
      clearInterval(poll);
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (auction?.id && socketRef.current) {
      auctionIdRef.current = auction.id;
      socketRef.current.emit('join-auction', auction.id);
    }
  }, [auction?.id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center page-mesh">
        <div className="glass px-6 py-4 text-[14px]" style={{ color: 'var(--text-2)' }}>Loading live…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen page-mesh" style={{ color: 'var(--text)' }}>
      <header className="glass sticky top-0 z-10 border-b" style={{ borderColor: 'var(--separator)' }}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[15px] font-semibold">{auction?.name || 'Live Auction'}</div>
            <div className="text-[12px] capitalize" style={{ color: 'var(--text-2)' }}>{auction?.status || '—'} · public view</div>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/results" className="text-sm font-medium" style={{ color: 'var(--accent)' }}>Results</Link>
            <Link to="/results" className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>Squads & results</Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {error && <div className="glass p-4 text-[13px]" style={{ color: '#ff9f0a' }}>{error}</div>}

        <div className="glass p-6 text-center">
          {player ? (
            <>
              <div className="text-[12px] uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>Now auctioning</div>
              <div className="text-[28px] font-semibold mt-1">{player.name}</div>
              <div className="text-[13px] mt-1" style={{ color: 'var(--text-2)' }}>{player.role}{player.city ? ` · ${player.city}` : ''}</div>
              <div className="text-[40px] font-semibold tabular-nums mt-4" style={{ color: 'var(--accent)' }}>
                ₹{Number(auction?.currentBid || 0).toLocaleString()}
              </div>
              <div className="text-[13px] mt-1" style={{ color: 'var(--text-2)' }}>
                Leading: <strong style={{ color: 'var(--text)' }}>{auction?.currentBidderName || '—'}</strong>
              </div>
            </>
          ) : (
            <div className="py-8" style={{ color: 'var(--text-2)' }}>Waiting for next player…</div>
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
