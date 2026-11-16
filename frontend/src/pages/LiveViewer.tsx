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
      setAuction(a);
      if (a?.id) {
        if (a.currentPlayerId) {
          try {
            const pr = await publicApi.get(`/players/public/${a.currentPlayerId}`);
            setCurrent(pr.data || null);
          } catch {
            setCurrent(null);
          }
        } else setCurrent(null);
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
    if (socketRef.current) {
      try { socketRef.current.disconnect(); } catch {}
      socketRef.current = null;
    }
    const socket = io(getSocketUrl(), {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 40,
      reconnectionDelay: 400,
      reconnectionDelayMax: 4000,
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
        setLastBid(prev => prev ? { ...prev, amount: r.price ?? r.sold?.soldPrice ?? prev.amount } : {
          amount: r.price ?? r.sold?.soldPrice ?? 0,
          teamName: r.team?.name
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

  // Fallback poll so Live never goes fully stale if socket drops
  useEffect(() => {
    if (!auction?.id) return;
    const id = window.setInterval(async () => {
      try {
        const aRes = await publicApi.get('/auctions/public/active');
        const a = aRes.data;
        if (a?.id) {
          setAuction((prev: any) => {
            if (!prev) return a;
            if (prev.currentPlayerId !== a.currentPlayerId || prev.currentBid !== a.currentBid || prev.status !== a.status) {
              return a;
            }
            return prev;
          });
          if (a.currentPlayerId) {
            publicApi.get(`/players/public/${a.currentPlayerId}`).then(pr => {
              if (pr.data) setCurrent(pr.data);
            }).catch(() => {});
          } else {
            setCurrent(null);
          }
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

  if (!auction) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6" style={{ background: 'var(--bg)' }}>
        <p style={{ color: 'var(--text-2)' }}>No live auction right now.</p>
        <Link to="/" className="as-btn-primary">Home</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[12px] uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>{auction.status}</div>
            <h1 className="text-[22px] font-semibold">{auction.name || 'Live Auction'}</h1>
          </div>
          <ThemeToggle />
        </div>

        <div className="glass p-5 min-h-[220px]">
          {current ? (
            <div className="flex gap-4 items-start">
              {current.photoUrl ? (
                <img src={current.photoUrl} alt="" className="w-24 h-24 rounded-2xl object-cover" />
              ) : (
                <div className="w-24 h-24 rounded-2xl flex items-center justify-center text-3xl" style={{ background: 'var(--fill)' }}>🏏</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[13px]" style={{ color: 'var(--text-2)' }}>Now auctioning</div>
                <h2 className="text-[26px] font-semibold leading-tight">{current.name}</h2>
                <div className="text-[13px] mt-1" style={{ color: 'var(--text-2)' }}>{current.role}{current.city ? ` · ${current.city}` : ''}</div>
                <div className="mt-4">
                  <div className="text-[12px]" style={{ color: 'var(--text-2)' }}>Current bid</div>
                  <div className="text-[30px] font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>
                    ₹{Number(auction.currentBid || lastBid?.amount || 0).toLocaleString()}
                  </div>
                  {lastBid?.teamName && (
                    <div className="text-[13px] mt-1" style={{ color: 'var(--text-2)' }}>by {lastBid.teamName}</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-[14px]" style={{ color: 'var(--text-2)' }}>
              Waiting for next player…
            </div>
          )}

          {lastSale && (
            <div className={`mt-4 p-3 rounded-xl text-[14px] ${lastSale.status === 'Sold' ? 'as-anim-sold' : 'as-anim-unsold'}`} style={{ background: 'var(--fill)' }}>
              <strong>{lastSale.status}</strong> — {lastSale.playerName}
              {lastSale.status === 'Sold' ? ` → ${lastSale.teamName} for ₹${Number(lastSale.price).toLocaleString()}` : ''}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button type="button" className={showBidHistory ? 'as-btn-primary text-sm' : 'as-btn-ghost text-sm'} onClick={() => setShowBidHistory(v => !v)}>
            Bids ({bidHistory.length})
          </button>
          <span className="text-[13px] self-center" style={{ color: 'var(--text-2)' }}>Sold {soldList.length}</span>
        </div>

        {showBidHistory && (
          <div className="glass overflow-hidden max-h-64 overflow-y-auto">
            {bidHistory.length === 0 ? (
              <div className="p-4 text-[13px]" style={{ color: 'var(--text-2)' }}>No bids yet</div>
            ) : bidHistory.map(b => (
              <div key={b.id} className="flex justify-between px-4 py-2 border-b" style={{ borderColor: 'var(--separator)' }}>
                <span>{b.teamName || b.teamId}</span>
                <span className="font-semibold tabular-nums">₹{Number(b.amount).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        <div className="glass overflow-hidden">
          <div className="px-4 py-2 text-[13px] font-medium" style={{ color: 'var(--text-2)' }}>Sold players</div>
          {soldList.length === 0 ? (
            <div className="p-4 text-[13px]" style={{ color: 'var(--text-2)' }}>None yet</div>
          ) : (
            <table>
              <thead><tr><th>Player</th><th>Team</th><th>Price</th></tr></thead>
              <tbody>
                {soldList.map(s => (
                  <tr key={s.id}>
                    <td className="font-medium">{s.player?.name || '—'}</td>
                    <td>{s.team?.name || '—'}</td>
                    <td className="tabular-nums">₹{Number(s.soldPrice || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
