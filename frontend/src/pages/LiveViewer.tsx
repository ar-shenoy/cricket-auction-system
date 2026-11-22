import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { publicApi, getSocketUrl } from '../services/api';
import { startKeepAliveInterval } from '../utils/keepAlive';
import { io, Socket } from 'socket.io-client';
import ThemeToggle from '../components/ThemeToggle';
import PlayerCard from '../components/PlayerCard';

interface Player {
  id: string; name: string; role?: string; photoUrl?: string; basePrice?: number;
  city?: string; battingStyle?: string; bowlingStyle?: string; age?: number | null; tags?: string[];
}
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
      try { res = await publicApi.get(`/auctions/${auctionId}/public/sold`); }
      catch { res = await publicApi.get('/auctions/public/sold'); }
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
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      let a: any = null;
      if (token) {
        const tRes = await publicApi.get(`/auctions/public/by-token/${token}`).catch(() => ({ data: null }));
        a = tRes.data?.auction || tRes.data || null;
      } else {
        const aRes = await publicApi.get('/auctions/public/active').catch(() => ({ data: null }));
        a = aRes.data;
      }
      setAuction(a || null);
      if (a?.currentPlayer) setCurrent(a.currentPlayer);
      else if (a?.currentPlayerId) {
        try {
          const pr = await publicApi.get(`/players/public/${a.currentPlayerId}`);
          setCurrent(pr.data);
        } catch { /* keep */ }
      } else setCurrent(null);
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div style={{ color: 'var(--text-2)' }}>Loading live auction…</div>
      </div>
    );
  }

  const cardStatus =
    lastSale?.status === 'Sold' ? 'sold' :
    lastSale?.status === 'Unsold' ? 'unsold' :
    current ? 'bidding' : 'idle';

  return (
    <div className="min-h-screen pb-10" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {!embedMode && (
        <header className="glass-nav sticky top-0 z-40">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-[15px] font-semibold">{auction?.name || 'Live Auction'}</div>
              <div className="text-xs capitalize" style={{ color: 'var(--text-2)' }}>{auction?.status || 'idle'} · Public</div>
            </div>
            <div className="flex items-center gap-3">
              <Link to="/results" className="text-[13px]" style={{ color: 'var(--accent)' }}>Report</Link>
              <ThemeToggle />
            </div>
          </div>
        </header>
      )}

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {!auction && (
          <div className="glass rounded-[22px] p-10 text-center" style={{ color: 'var(--text-2)' }}>
            No live auction right now. Check back when bidding starts.
          </div>
        )}

        {auction && current && (
          <PlayerCard
            key={current.id + String(cardStatus)}
            player={current}
            bid={lastBid?.amount ?? auction?.currentBid ?? current.basePrice}
            leadingTeam={lastBid?.teamName || auction?.currentBidderName}
            status={cardStatus as any}
            soldPrice={lastSale?.price}
            soldTeam={lastSale?.teamName}
          />
        )}

        {auction && !current && (
          <div className="glass rounded-[22px] p-10 text-center" style={{ color: 'var(--text-2)' }}>
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
          <span className="text-[13px]" style={{ color: 'var(--text-2)' }}>Sold {soldList.length}</span>
        </div>

        {showBidHistory && (
          <div className="glass rounded-2xl overflow-hidden max-h-64 overflow-y-auto">
            {bidHistory.length === 0 ? (
              <div className="p-4 text-[13px]" style={{ color: 'var(--text-2)' }}>No bids yet</div>
            ) : bidHistory.map(b => (
              <div key={b.id} className="flex justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--separator)' }}>
                <span>{b.teamName || b.teamId}</span>
                <span className="font-semibold tabular-nums">₹{Number(b.amount).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-4 py-2.5 text-[13px] font-medium" style={{ color: 'var(--text-2)' }}>Sold players</div>
          {soldList.length === 0 ? (
            <div className="p-4 text-[13px]" style={{ color: 'var(--text-2)' }}>None yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: 'var(--text-2)', textAlign: 'left' }}>
                  <th className="px-4 py-2">Player</th>
                  <th className="px-2 py-2">Team</th>
                  <th className="px-4 py-2 text-right">Price</th>
                </tr>
              </thead>
              <tbody>
                {soldList.map(s => (
                  <tr key={s.id} style={{ borderTop: '1px solid var(--separator)' }}>
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
