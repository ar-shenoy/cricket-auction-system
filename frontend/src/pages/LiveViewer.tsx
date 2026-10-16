import React, { useEffect, useState, useCallback, useRef } from 'react';
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

interface SoldRow {
  id: string;
  soldPrice: number;
  soldAt?: string;
  player?: Player;
  team?: Team;
}

export default function LiveViewer() {
  const [auction, setAuction] = useState<any>(null);
  const [current, setCurrent] = useState<Player | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [soldList, setSoldList] = useState<SoldRow[]>([]);
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

  const load = useCallback(async () => {
    try {
      const [aRes, tRes] = await Promise.all([
        publicApi.get('/auctions/public/active').catch(() => ({ data: null })),
        publicApi.get('/teams')
      ]);
      const a = aRes.data;
      setAuction(a || null);
      setTeams(tRes.data || []);
      if (a?.currentPlayer) {
        setCurrent(a.currentPlayer);
      } else if (a?.currentPlayerId) {
        try {
          const pr = await publicApi.get(`/players/public/${a.currentPlayerId}`);
          setCurrent(pr.data);
        } catch {
          setCurrent(null);
        }
      } else {
        setCurrent(null);
      }
      if (a?.currentBid != null && a.currentBid > 0) {
        setLastBid({ amount: a.currentBid, teamName: a.currentBidderName || undefined });
      } else if (!a?.currentPlayerId) {
        setLastBid(null);
      }
      if (a?.id) await loadSold(a.id);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    startKeepAliveInterval();
    const poll = setInterval(load, 10000);

    const socket = io(getSocketUrl(), { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('player-selected', (data: { auction: any; player: Player }) => {
      setAuction(data.auction);
      setCurrent(data.player);
      setLastBid({
        amount: data.auction?.currentBid ?? data.player?.basePrice ?? 0,
        teamName: undefined
      });
      setLastSale(null);
    });

    socket.on('new-bid', (data: { auction: any; bid: any; team: { id: string; name: string } }) => {
      if (data.auction) setAuction(data.auction);
      setLastBid({
        amount: data.bid?.amount ?? data.auction?.currentBid,
        teamName: data.team?.name
      });
    });

    socket.on('player-sold', (data: { auction: any; result: any }) => {
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
        if (data.auction?.id) loadSold(data.auction.id);
        publicApi.get('/teams').then(res => setTeams(res.data || [])).catch(() => {});
      }
    });

    socket.on('auction-status', (a: any) => setAuction(a));
    socket.on('auction-ended', (a: any) => {
      setAuction(a);
      setCurrent(null);
      setLastBid(null);
    });

    return () => {
      clearInterval(poll);
      if (joinedIdRef.current) socket.emit('leave-auction', joinedIdRef.current);
      socket.disconnect();
    };
  }, [load]);

  useEffect(() => {
    const id = auction?.id;
    const socket = socketRef.current;
    if (!socket || !id) return;
    if (joinedIdRef.current === id) return;
    if (joinedIdRef.current) socket.emit('leave-auction', joinedIdRef.current);
    socket.emit('join-auction', id);
    joinedIdRef.current = id;
  }, [auction?.id]);

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

        {lastSale && (
          <div
            className="glass rounded-[22px] p-5 text-center"
            style={{
              border: lastSale.status === 'Sold' ? '1px solid rgba(48,209,88,0.4)' : '1px solid rgba(255,159,10,0.35)'
            }}
          >
            <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: lastSale.status === 'Sold' ? '#30d158' : '#ff9f0a' }}>
              {lastSale.status === 'Sold' ? 'SOLD' : 'UNSOLD'}
            </div>
            <div className="text-2xl font-semibold text-[var(--text-primary)]">{lastSale.playerName}</div>
            {lastSale.status === 'Sold' && (
              <div className="mt-2 text-[15px] text-[var(--text-secondary)]">
                to <span className="font-medium text-[var(--text-primary)]">{lastSale.teamName}</span>
                {' '}for{' '}
                <span className="font-semibold tabular-nums" style={{ color: '#30d158' }}>
                  ₹{Number(lastSale.price).toLocaleString()}
                </span>
              </div>
            )}
          </div>
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

        {!current && auction && !lastSale && (
          <div className="glass rounded-[22px] p-8 text-center text-[var(--text-secondary)]">
            Waiting for next player…
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

        {soldList.length > 0 && (
          <div className="glass rounded-[22px] p-5">
            <h3 className="font-semibold mb-4 text-[var(--text-primary)]">
              Sold ({soldList.length})
            </h3>
            <ul className="space-y-2 max-h-80 overflow-y-auto">
              {soldList.map(s => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5 bg-black/5 dark:bg-white/5 text-[14px]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {s.player?.photoUrl ? (
                      <img src={s.player.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                    ) : (
                      <span className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center text-xs shrink-0">P</span>
                    )}
                    <div className="min-w-0">
                      <div className="font-medium truncate text-[var(--text-primary)]">{s.player?.name || '—'}</div>
                      <div className="text-[12px] text-[var(--text-secondary)] truncate">{s.team?.name || '—'}</div>
                    </div>
                  </div>
                  <div className="font-semibold tabular-nums shrink-0" style={{ color: '#30d158' }}>
                    ₹{Number(s.soldPrice || 0).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
