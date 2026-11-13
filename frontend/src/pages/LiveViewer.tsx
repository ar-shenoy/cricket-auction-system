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
      const res = await publicApi.get(`/auctions/${auctionId}/public/sold`);
      setSoldList((res.data || []).slice().reverse());
    } catch { /* ignore */ }
  };

  const loadBids = async (auctionId: string) => {
    try {
      const res = await publicApi.get(`/auctions/${auctionId}/public/bids`);
      setBidHistory(res.data || []);
    } catch { setBidHistory([]); }
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
        } catch { setCurrent(null); }
      } else setCurrent(null);
      if (a?.currentBid != null && a.currentBid > 0) {
        setLastBid({ amount: a.currentBid, teamName: a.currentBidderName || undefined });
      } else {
        setLastBid(null);
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
    startKeepAliveInterval();
  }, [load]);

  useEffect(() => {
    if (!auction?.id) return;
    if (joinedIdRef.current === auction.id) return;
    joinedIdRef.current = auction.id;
    const socket = io(getSocketUrl(), { transports: ['websocket', 'polling'], reconnection: true });
    socketRef.current = socket;
    socket.emit('join-auction', auction.id);

    socket.on('player-selected', (data: any) => {
      if (data.auction) setAuction(data.auction);
      if (data.player) setCurrent(data.player);
      setLastBid({
        amount: data.auction?.currentBid ?? data.player?.basePrice ?? 0,
        teamName: data.auction?.currentBidderName || undefined
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
      setCurrent(null);
      setLastBid(null);
      const r = data.result;
      if (r) {
        setLastSale({
          status: r.status || 'Sold',
          playerName: r.player?.name || 'Player',
          teamName: r.team?.name || '—',
          price: r.price ?? r.sold?.soldPrice ?? 0
        });
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-[var(--text-secondary)]">Loading live auction…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-10" style={{ background: 'var(--bg)', color: 'var(--text-primary)' }}>
      <header className="glass-nav sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-[15px] font-semibold">{auction?.name || 'Live Auction'}</div>
            <div className="text-xs text-[var(--text-secondary)] capitalize">{auction?.status || 'idle'} · Public View</div>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/results" className="text-[13px]" style={{ color: 'var(--accent)' }}>Results</Link>
            <Link to="/results" className="text-[13px] text-[var(--text-secondary)]">Squads & results</Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {lastSale && !current && (
          <div className="glass rounded-[22px] p-5 text-center">
            <div className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">{lastSale.status}</div>
            <div className="text-2xl font-semibold mt-1">
              {lastSale.playerName}
              {lastSale.status === 'Sold' && <span className="text-[var(--text-secondary)] font-normal"> → {lastSale.teamName}</span>}
            </div>
            {lastSale.status === 'Sold' && (
              <div className="text-xl font-semibold tabular-nums mt-2" style={{ color: 'var(--accent)' }}>
                ₹{Number(lastSale.price).toLocaleString()}
              </div>
            )}
          </div>
        )}

        {current && (
          <div className="glass rounded-[22px] p-6 text-center">
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
            <div className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Now auctioning</div>
            <h2 className="text-3xl sm:text-4xl font-semibold mt-1">{current.name}</h2>
            <p className="text-[var(--text-secondary)] mt-1">
              {current.role || 'Player'}{current.city ? ` · ${current.city}` : ''}
            </p>
            <div className="mt-6 inline-block glass-strong rounded-2xl px-6 py-3">
              <div className="text-xs text-[var(--text-secondary)] uppercase">Current bid</div>
              <div className="text-3xl sm:text-4xl font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                ₹{Number(lastBid?.amount ?? auction?.currentBid ?? current?.basePrice ?? 0).toLocaleString()}
              </div>
              <div className="text-sm text-[var(--text-secondary)] mt-1">
                Leading:{' '}
                <span className="font-medium text-[var(--text-primary)]">
                  {lastBid?.teamName || auction?.currentBidderName || '—'}
                </span>
              </div>
            </div>
          </div>
        )}

        {!current && auction && !lastSale && (
          <div className="glass rounded-[22px] p-8 text-center text-[var(--text-secondary)]">
            Waiting for next player…
          </div>
        )}

        <div className="glass rounded-[22px] overflow-hidden">
          <button
            type="button"
            onClick={() => setShowBidHistory(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 text-left"
          >
            <span className="font-semibold text-[var(--text-primary)]">
              Bid history{' '}
              {bidHistory.length > 0 && (
                <span className="text-[var(--text-secondary)] font-normal">({bidHistory.length})</span>
              )}
            </span>
            <span className="text-[var(--text-secondary)] text-sm">{showBidHistory ? '▾ Hide' : '▸ Show'}</span>
          </button>
          {showBidHistory && (
            <div className="px-5 pb-4 border-t border-black/5 dark:border-white/10">
              {bidHistory.length === 0 ? (
                <div className="py-4 text-sm text-[var(--text-secondary)] text-center">No bids yet</div>
              ) : (
                <ul className="space-y-1.5 max-h-64 overflow-y-auto pt-3">
                  {bidHistory.map((b, i) => (
                    <li
                      key={b.id || i}
                      className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 bg-black/5 dark:bg-white/5 text-[13px]"
                    >
                      <span className="truncate text-[var(--text-secondary)]">{b.teamName || 'Team'}</span>
                      <span className="font-semibold tabular-nums text-[var(--text-primary)]">
                        ₹{Number(b.amount || 0).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {soldList.length > 0 && (
          <div className="glass rounded-[22px] p-5">
            <h3 className="font-semibold mb-4 text-[var(--text-primary)]">Sold ({soldList.length})</h3>
            <ul className="space-y-2 max-h-80 overflow-y-auto">
              {soldList.map(s => (
                <li key={s.id} className="flex items-center gap-3 text-[13px]">
                  {s.player?.photoUrl ? (
                    <img src={s.player.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center shrink-0 text-xs">🏏</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{s.player?.name || 'Player'}</div>
                    <div className="text-[var(--text-secondary)] truncate">{s.team?.name || '—'}</div>
                  </div>
                  <div className="font-semibold tabular-nums shrink-0">₹{Number(s.soldPrice || 0).toLocaleString()}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
