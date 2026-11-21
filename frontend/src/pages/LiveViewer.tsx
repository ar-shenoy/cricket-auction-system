import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { publicApi, getSocketUrl } from '../services/api';
import { startKeepAliveInterval } from '../utils/keepAlive';
import { io, Socket } from 'socket.io-client';
import ThemeToggle from '../components/ThemeToggle';

interface Player { id: string; name: string; role?: string; photoUrl?: string; basePrice?: number; city?: string; }
interface Team { id: string; name: string; logoUrl?: string; }
interface SoldRow { id: string; soldPrice: number; soldAt?: string; player?: Player; team?: Team; }
interface BidRow { id: string; amount: number; teamId: string; teamName?: string; playerId?: string; createdAt?: string | null; }

export default function LiveViewer() {
  const embedMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('embed') === '1';
  React.useEffect(() => {
    if (!embedMode) return;
    document.body.classList.add('as-embed');
    return () => document.body.classList.remove('as-embed');
  }, [embedMode]);

  const [auction, setAuction] = useState<any>(null);
  const [current, setCurrent] = useState<Player | null>(null);
  const [soldList, setSoldList] = useState<SoldRow[]>([]);
  const [bidHistory, setBidHistory] = useState<BidRow[]>([]);
  const [showBidHistory, setShowBidHistory] = useState(false);
  const [lastBid, setLastBid] = useState<{ teamName?: string; amount?: number } | null>(null);
  const [lastSale, setLastSale] = useState<{ playerName: string; teamName: string; price: number; status: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const joinedIdRef = useRef<string | null>(null);

  const loadSold = async (auctionId: string) => {
    try {
      let res;
      try {
        res = await publicApi.get(`/auctions/${auctionId}/public/sold`);
      } catch {
        res = await publicApi.get('/auctions/public/sold');
      }
      setSoldList(res.data || []);
    } catch { /* ignore */ }
  };

  const loadBids = async (auctionId: string) => {
    try {
      const res = await publicApi.get(`/auctions/${auctionId}/public/bids`);
      setBidHistory(res.data || []);
    } catch { /* ignore */ }
  };

  const load = useCallback(async () => {
    try {
      const aRes = await publicApi.get('/auctions/public/active').catch(() => ({ data: null }));
      const a = aRes.data;
      setAuction(a || null);
      if (a?.currentPlayer) setCurrent(a.currentPlayer);
      else if (a?.currentPlayerId) {
        try {
          const pr = await publicApi.get(`/players/public/${a.currentPlayerId}`);
          setCurrent(pr.data);
        } catch { /* keep previous */ }
      }
      if (a?.id) {
        await loadSold(a.id);
        await loadBids(a.id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return startKeepAliveInterval();
  }, [load]);

  useEffect(() => {
    if (!auction?.id) return;
    if (joinedIdRef.current === auction.id && socketRef.current) return;
    if (socketRef.current) {
      try { socketRef.current.disconnect(); } catch {}
    }
    const socket = io(getSocketUrl(), {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 40,
      reconnectionDelay: 400,
      timeout: 10000
    });
    socketRef.current = socket;
    joinedIdRef.current = auction.id;
    const join = () => socket.emit('join-auction', auction.id);
    join();
    socket.on('connect', join);

    socket.on('player-selected', (data: any) => {
      if (data.auction) setAuction(data.auction);
      if (data.player) setCurrent(data.player);
      setLastBid({
        amount: data.auction?.currentBid ?? data.player?.basePrice ?? 0,
        teamName: data.auction?.currentBidderName || data.team?.name
      });
      setLastSale(null);
    });

    socket.on('new-bid', (data: any) => {
      if (data.auction) setAuction(data.auction);
      setLastBid({
        amount: data.bid?.amount ?? data.auction?.currentBid,
        teamName: data.team?.name || data.auction?.currentBidderName
      });
      if (data.bid) {
        setBidHistory(prev => [{
          id: data.bid.id || String(Date.now()),
          amount: Number(data.bid.amount) || 0,
          teamId: data.team?.id || '',
          teamName: data.team?.name,
          playerId: data.bid.playerId,
          createdAt: data.bid.createdAt
        }, ...prev].slice(0, 40));
      }
    });

    socket.on('player-sold', (data: any) => {
      if (data.auction) setAuction(data.auction);
      const r = data.result;
      if (r) {
        const status = r.status || 'Sold';
        setLastSale({
          status,
          playerName: r.player?.name || 'Player',
          teamName: r.team?.name || '—',
          price: r.price ?? r.sold?.soldPrice ?? 0
        });
        if (r.player) setCurrent(r.player);
      }
      if (data.auction?.id) {
        loadSold(data.auction.id);
        loadBids(data.auction.id);
      }
    });

    socket.on('auction-status', (a: any) => setAuction(a));
    socket.on('auction-started', (a: any) => setAuction(a));
    socket.on('auction-ended', (a: any) => setAuction(a));

    return () => {
      socket.disconnect();
      joinedIdRef.current = null;
    };
  }, [auction?.id]);

  useEffect(() => {
    if (!auction?.id) return;
    const id = window.setInterval(async () => {
      try {
        const aRes = await publicApi.get('/auctions/public/active');
        const a = aRes.data;
        if (!a?.id) return;
        setAuction((prev: any) => {
          if (!prev) return a;
          if (prev.currentPlayerId !== a.currentPlayerId || prev.currentBid !== a.currentBid || prev.status !== a.status) return a;
          return prev;
        });
        if (a.currentPlayerId) {
          setCurrent(prev => {
            if (prev?.id === a.currentPlayerId) return prev;
            publicApi.get(`/players/public/${a.currentPlayerId}`).then(pr => {
              if (pr.data) setCurrent(pr.data);
            }).catch(() => {});
            return prev;
          });
        }
      } catch { /* ignore */ }
    }, 4000);
    return () => clearInterval(id);
  }, [auction?.id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-[var(--text-secondary)]">Loading live auction…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-10" style={{ background: 'var(--bg)', color: 'var(--text-primary)' }}>
      {!embedMode && (
        <header className="glass-nav sticky top-0 z-40">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-[15px] font-semibold">{auction?.name || 'Live Auction'}</div>
              <div className="text-xs text-[var(--text-secondary)] capitalize">{auction?.status || 'idle'} · Public View</div>
            </div>
            <div className="flex items-center gap-3">
              <Link to="/results" className="text-[13px]" style={{ color: 'var(--accent)' }}>View report</Link>
              <ThemeToggle />
            </div>
          </div>
        </header>
      )}
      {embedMode && (
        <div className="px-4 pt-3 text-center">
          <h1 className="text-lg font-semibold">{auction?.name || 'Live Auction'}</h1>
          <div className="text-xs text-[var(--text-secondary)] capitalize">{auction?.status || 'idle'}</div>
        </div>
      )}

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {current && (
          <div className={`glass rounded-[22px] p-6 text-center relative overflow-hidden ${
            lastSale?.status === 'Sold' ? 'as-anim-sold' :
            lastSale?.status === 'Unsold' ? 'as-anim-unsold' :
            lastSale?.status === 'Recalled' ? 'as-anim-recall' : ''
          }`}>
            {current.photoUrl ? (
              <img
                src={current.photoUrl}
                alt=""
                className="w-44 h-44 sm:w-56 sm:h-56 md:w-64 md:h-64 rounded-3xl object-cover mx-auto mb-4 shadow-xl"
              />
            ) : (
              <div className="w-44 h-44 sm:w-56 sm:h-56 md:w-64 md:h-64 rounded-3xl mx-auto mb-4 flex items-center justify-center text-6xl bg-black/5 dark:bg-white/10">
                🏏
              </div>
            )}
            <div className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">
              {lastSale ? lastSale.status : 'Now auctioning'}
            </div>
            <h2 className="text-3xl sm:text-4xl font-semibold mt-1">{current.name}</h2>
            <p className="text-[var(--text-secondary)] mt-1">
              {current.role || 'Player'}{current.city ? ` · ${current.city}` : ''}
            </p>

            {lastSale ? (
              <div className="mt-6 inline-block glass-strong rounded-2xl px-6 py-3">
                <div className={`text-2xl sm:text-3xl font-bold tracking-wide ${
                  lastSale.status === 'Sold' ? 'text-emerald-400' :
                  lastSale.status === 'Unsold' ? 'text-amber-400' : 'text-sky-400'
                }`}>
                  {lastSale.status === 'Sold' ? 'SOLD' : lastSale.status === 'Unsold' ? 'UNSOLD' : lastSale.status.toUpperCase()}
                </div>
                {lastSale.status === 'Sold' && (
                  <>
                    <div className="text-xl font-semibold tabular-nums mt-1" style={{ color: 'var(--accent)' }}>
                      ₹{Number(lastSale.price).toLocaleString()}
                    </div>
                    <div className="text-sm text-[var(--text-secondary)] mt-1">→ {lastSale.teamName}</div>
                  </>
                )}
              </div>
            ) : (
              <div className="mt-6 inline-block glass-strong rounded-2xl px-6 py-3">
                <div className="text-xs text-[var(--text-secondary)] uppercase">Current bid</div>
                <div className="text-3xl sm:text-4xl font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                  ₹{Number(lastBid?.amount ?? auction?.currentBid ?? current?.basePrice ?? 0).toLocaleString()}
                </div>
                <div className="text-sm text-[var(--text-secondary)] mt-1">
                  Leading:{' '}
                  <span className="font-medium">{lastBid?.teamName || '—'}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {!current && (
          <div className="glass rounded-[22px] p-10 text-center text-[var(--text-secondary)]">
            Waiting for next player…
          </div>
        )}

        <div className="flex gap-2 items-center">
          <button
            type="button"
            className={showBidHistory ? 'as-btn-primary text-sm' : 'as-btn-ghost text-sm'}
            onClick={() => setShowBidHistory(v => !v)}
          >
            Bids ({bidHistory.length})
          </button>
          <span className="text-[13px] text-[var(--text-secondary)]">Sold {soldList.length}</span>
        </div>

        {showBidHistory && (
          <div className="glass rounded-2xl overflow-hidden max-h-64 overflow-y-auto">
            {bidHistory.length === 0 ? (
              <div className="p-4 text-[13px] text-[var(--text-secondary)]">No bids yet</div>
            ) : bidHistory.map(b => (
              <div key={b.id} className="flex justify-between px-4 py-2.5 border-b border-white/5">
                <span>{b.teamName || b.teamId}</span>
                <span className="font-semibold tabular-nums">₹{Number(b.amount).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-4 py-2.5 text-[13px] font-medium text-[var(--text-secondary)]">Sold players</div>
          {soldList.length === 0 ? (
            <div className="p-4 text-[13px] text-[var(--text-secondary)]">None yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--text-secondary)]">
                  <th className="px-4 py-2">Player</th>
                  <th className="px-2 py-2">Team</th>
                  <th className="px-4 py-2 text-right">Price</th>
                </tr>
              </thead>
              <tbody>
                {soldList.map(s => (
                  <tr key={s.id} className="border-t border-white/5">
                    <td className="px-4 py-2 font-medium">{s.player?.name || '—'}</td>
                    <td className="px-2 py-2">{s.team?.name || '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">₹{Number(s.soldPrice || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
