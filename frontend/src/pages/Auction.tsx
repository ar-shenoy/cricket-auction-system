import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { io, Socket } from 'socket.io-client';

interface Player {
  id: string;
  name: string;
  role: string;
  basePrice: number;
  city?: string;
  bio?: string;
  status: string;
}

interface Team {
  id: string;
  name: string;
  purse: number;
  remainingPurse: number;
}

interface Auction {
  id: string;
  name: string;
  status: 'draft' | 'live' | 'paused' | 'completed';
  currentPlayerId: string | null;
  currentBid: number;
  currentBidderTeamId: string | null;
  bidIncrement: number;
  bidTimerSeconds: number;
  timerEndsAt: string | null;
}

interface SoldRecord {
  id: string;
  playerId: string;
  teamId: string;
  soldPrice: number;
  player?: Player;
  team?: Team;
}

export default function Auction() {
  const { user, logout } = useAuth();
  const [auction, setAuction] = useState<Auction | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [soldList, setSoldList] = useState<SoldRecord[]>([]);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [bidAmount, setBidAmount] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [creating, setCreating] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // ========== Load initial data ==========
  const loadAuction = useCallback(async () => {
    try {
      const [auctionRes, teamsRes] = await Promise.all([
        api.get('/auctions/active'),
        api.get('/teams')
      ]);
      const active = auctionRes.data;
      setAuction(active);
      setTeams(teamsRes.data);

      if (active?.id) {
        const [playersRes, soldRes] = await Promise.all([
          api.get(`/auctions/${active.id}/available-players`),
          api.get(`/auctions/${active.id}/sold`)
        ]);
        setAvailablePlayers(playersRes.data);
        setSoldList(soldRes.data);

        if (active.currentPlayerId) {
          const playerRes = await api.get(`/players/${active.currentPlayerId}`);
          setCurrentPlayer(playerRes.data);
          setBidAmount(String(active.currentBid + (active.bidIncrement || 50000)));
        } else {
          setCurrentPlayer(null);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAuction();
  }, [loadAuction]);

  // ========== Socket.IO ==========
  useEffect(() => {
    if (!auction?.id) return;

    // Connect to backend socket (in dev proxy may not work for socket, so use full URL if needed)
    const socket = io(window.location.origin.includes('localhost') 
      ? 'http://localhost:5000' 
      : window.location.origin, {
      transports: ['websocket', 'polling']
    });

    socketRef.current = socket;

    socket.emit('join-auction', auction.id);

    socket.on('player-selected', (data: { auction: Auction; player: Player }) => {
      setAuction(data.auction);
      setCurrentPlayer(data.player);
      setBidAmount(String((data.auction.currentBid || 0) + (data.auction.bidIncrement || 50000)));
      setMessage({ type: 'info', text: `Now auctioning: ${data.player.name}` });
      // Refresh available list
      api.get(`/auctions/${data.auction.id}/available-players`).then(r => setAvailablePlayers(r.data));
    });

    socket.on('new-bid', (data: { auction: Auction; bid: any; team: { id: string; name: string } }) => {
      setAuction(data.auction);
      setBidAmount(String(data.auction.currentBid + (data.auction.bidIncrement || 50000)));
      setMessage({ type: 'success', text: `${data.team.name} bid ₹${data.bid.amount.toLocaleString()}` });
    });

    socket.on('player-sold', (data: { auction: Auction; result: any }) => {
      setAuction(data.auction);
      setCurrentPlayer(null);
      setMessage({
        type: data.result.status === 'Sold' ? 'success' : 'info',
        text: data.result.status === 'Sold'
          ? `SOLD! ${data.result.player?.name} to ${data.result.team?.name} for ₹${data.result.price?.toLocaleString()}`
          : `UNSOLD: ${data.result.player?.name}`
      });
      // Refresh lists
      if (auction.id) {
        api.get(`/auctions/${auction.id}/sold`).then(r => setSoldList(r.data));
        api.get(`/auctions/${auction.id}/available-players`).then(r => setAvailablePlayers(r.data));
        api.get('/teams').then(r => setTeams(r.data));
      }
    });

    socket.on('auction-status', (data: Auction) => {
      setAuction(data);
      setMessage({ type: 'info', text: `Auction ${data.status}` });
    });

    socket.on('auction-ended', (data: Auction) => {
      setAuction(data);
      setCurrentPlayer(null);
      setMessage({ type: 'info', text: 'Auction has ended' });
    });

    return () => {
      socket.emit('leave-auction', auction.id);
      socket.disconnect();
    };
  }, [auction?.id]);

  // ========== Timer ==========
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (auction?.status === 'live' && auction.timerEndsAt && currentPlayer) {
      const updateTimer = () => {
        const ends = new Date(auction.timerEndsAt!).getTime();
        const now = Date.now();
        const left = Math.max(0, Math.floor((ends - now) / 1000));
        setTimeLeft(left);

        // Auto-sell when timer hits 0 (admin can also do it manually)
        if (left === 0 && user?.role === 'admin') {
          // Optional auto-sell – we leave it to admin button for control
        }
      };
      updateTimer();
      timerRef.current = setInterval(updateTimer, 250);
    } else {
      setTimeLeft(0);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [auction?.timerEndsAt, auction?.status, currentPlayer, user?.role]);

  // ========== Actions ==========
  const showMsg = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const createAuction = async () => {
    setCreating(true);
    try {
      const res = await api.post('/auctions', {
        name: `Cricket Auction ${new Date().toLocaleDateString()}`,
        bidIncrement: 50000,
        bidTimerSeconds: 20
      });
      setAuction(res.data);
      showMsg('success', 'Auction created. Click Start when ready.');
    } catch (err: any) {
      showMsg('error', err.response?.data?.error || 'Failed to create auction');
    } finally {
      setCreating(false);
    }
  };

  const startAuction = async () => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/start`);
      setAuction(res.data);
      showMsg('success', 'Auction is now LIVE');
    } catch (err: any) {
      showMsg('error', err.response?.data?.error || 'Failed to start');
    }
  };

  const pauseAuction = async () => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/pause`);
      setAuction(res.data);
    } catch (err: any) {
      showMsg('error', err.response?.data?.error || 'Failed');
    }
  };

  const selectPlayer = async (playerId: string) => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/select-player`, { playerId });
      setAuction(res.data.auction);
      setCurrentPlayer(res.data.player);
      setBidAmount(String((res.data.auction.currentBid || 0) + (res.data.auction.bidIncrement || 50000)));
    } catch (err: any) {
      showMsg('error', err.response?.data?.error || 'Failed to select player');
    }
  };

  const placeBid = async () => {
    if (!auction || !bidAmount) return;
    try {
      await api.post(`/auctions/${auction.id}/bid`, { amount: Number(bidAmount) });
      // Socket will update state
    } catch (err: any) {
      showMsg('error', err.response?.data?.error || 'Bid failed');
    }
  };

  const sellPlayer = async () => {
    if (!auction) return;
    try {
      await api.post(`/auctions/${auction.id}/sell`);
      // Socket will update
    } catch (err: any) {
      showMsg('error', err.response?.data?.error || 'Failed to sell');
    }
  };

  const markUnsold = async () => {
    if (!auction) return;
    try {
      await api.post(`/auctions/${auction.id}/unsold`);
    } catch (err: any) {
      showMsg('error', err.response?.data?.error || 'Failed');
    }
  };

  const endAuction = async () => {
    if (!auction) return;
    if (!confirm('End this auction permanently?')) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/end`);
      setAuction(res.data);
      setCurrentPlayer(null);
      showMsg('info', 'Auction ended');
    } catch (err: any) {
      showMsg('error', err.response?.data?.error || 'Failed');
    }
  };

  // Current highest bidder name
  const currentBidderName = teams.find(t => t.id === auction?.currentBidderTeamId)?.name || '—';
  const myTeam = teams.find(t => t.id === user?.teamId);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading auction...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-gray-500 hover:text-gray-700 text-sm">← Dashboard</Link>
            <h1 className="text-lg font-bold text-gray-900">
              🏏 Live Auction
              {auction && (
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${
                  auction.status === 'live' ? 'bg-green-100 text-green-700' :
                  auction.status === 'paused' ? 'bg-yellow-100 text-yellow-700' :
                  auction.status === 'completed' ? 'bg-gray-100 text-gray-600' :
                  'bg-blue-100 text-blue-700'
                }`}>
                  {auction.status.toUpperCase()}
                </span>
              )}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {myTeam && (
              <span className="text-sm bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full">
                {myTeam.name}: ₹{myTeam.remainingPurse.toLocaleString()}
              </span>
            )}
            <span className="text-sm text-gray-600">{user?.name}</span>
            <button onClick={logout} className="text-sm text-red-600">Logout</button>
          </div>
        </div>
      </header>

      {/* Message Toast */}
      {message && (
        <div className={`max-w-7xl mx-auto px-4 mt-3`}>
          <div className={`px-4 py-2 rounded-lg text-sm font-medium ${
            message.type === 'success' ? 'bg-green-100 text-green-800' :
            message.type === 'error' ? 'bg-red-100 text-red-800' :
            'bg-blue-100 text-blue-800'
          }`}>
            {message.text}
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-4">
        {/* No Auction Yet */}
        {!auction && user?.role === 'admin' && (
          <div className="bg-white rounded-xl shadow p-8 text-center">
            <h2 className="text-xl font-bold mb-2">No Active Auction</h2>
            <p className="text-gray-500 mb-4">Create a new auction to get started.</p>
            <button
              onClick={createAuction}
              disabled={creating}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Auction'}
            </button>
          </div>
        )}

        {!auction && user?.role !== 'admin' && (
          <div className="bg-white rounded-xl shadow p-8 text-center text-gray-500">
            Waiting for admin to start the auction...
          </div>
        )}

        {auction && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* LEFT: Current Player + Bidding */}
            <div className="lg:col-span-2 space-y-4">
              {/* Current Player Card */}
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                {currentPlayer ? (
                  <div className="p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="text-sm text-gray-500 mb-1">Now Auctioning</div>
                        <h2 className="text-3xl font-bold text-gray-900">{currentPlayer.name}</h2>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full">{currentPlayer.role}</span>
                          {currentPlayer.city && (
                            <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">{currentPlayer.city}</span>
                          )}
                          <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">
                            Base: ₹{currentPlayer.basePrice?.toLocaleString() || 0}
                          </span>
                        </div>
                        {currentPlayer.bio && (
                          <p className="text-sm text-gray-500 mt-2 max-w-md">{currentPlayer.bio}</p>
                        )}
                      </div>

                      {/* Timer */}
                      <div className={`text-center px-6 py-4 rounded-xl ${
                        timeLeft <= 5 ? 'bg-red-100' : timeLeft <= 10 ? 'bg-yellow-100' : 'bg-green-50'
                      }`}>
                        <div className="text-xs text-gray-500 uppercase tracking-wide">Time Left</div>
                        <div className={`text-4xl font-bold tabular-nums ${
                          timeLeft <= 5 ? 'text-red-600' : timeLeft <= 10 ? 'text-yellow-700' : 'text-green-700'
                        }`}>
                          {String(Math.floor(timeLeft / 60)).padStart(1, '0')}:{String(timeLeft % 60).padStart(2, '0')}
                        </div>
                      </div>
                    </div>

                    {/* Current Bid */}
                    <div className="mt-6 grid grid-cols-2 gap-4">
                      <div className="bg-gray-50 rounded-lg p-4 text-center">
                        <div className="text-xs text-gray-500">Current Bid</div>
                        <div className="text-2xl font-bold text-gray-900">
                          ₹{(auction.currentBid || 0).toLocaleString()}
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-4 text-center">
                        <div className="text-xs text-gray-500">Highest Bidder</div>
                        <div className="text-lg font-semibold text-indigo-700">{currentBidderName}</div>
                      </div>
                    </div>

                    {/* Bid Controls (Team Manager) */}
                    {(user?.role === 'team_manager' || user?.role === 'admin') && auction.status === 'live' && (
                      <div className="mt-6 flex flex-col sm:flex-row gap-3 items-end">
                        <div className="flex-1">
                          <label className="block text-xs text-gray-500 mb-1">Your Bid (₹)</label>
                          <input
                            type="number"
                            value={bidAmount}
                            onChange={e => setBidAmount(e.target.value)}
                            className="w-full border rounded-lg px-4 py-2.5 text-lg font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                            step={auction.bidIncrement}
                          />
                        </div>
                        <button
                          onClick={placeBid}
                          className="bg-green-600 hover:bg-green-700 text-white font-bold px-8 py-2.5 rounded-lg text-lg shadow"
                        >
                          PLACE BID
                        </button>
                      </div>
                    )}

                    {/* Admin Controls for current player */}
                    {user?.role === 'admin' && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button onClick={sellPlayer} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                          🔨 Sell / Confirm
                        </button>
                        <button onClick={markUnsold} className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                          Mark Unsold
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-10 text-center text-gray-500">
                    <div className="text-4xl mb-2">🏏</div>
                    <p>No player currently being auctioned.</p>
                    {user?.role === 'admin' && auction.status === 'live' && (
                      <p className="text-sm mt-1">Select a player from the list on the right →</p>
                    )}
                  </div>
                )}
              </div>

              {/* Admin Global Controls */}
              {user?.role === 'admin' && (
                <div className="bg-white rounded-xl shadow-sm border p-4 flex flex-wrap gap-2">
                  {auction.status === 'draft' && (
                    <button onClick={startAuction} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                      ▶️ Start Auction
                    </button>
                  )}
                  {(auction.status === 'live' || auction.status === 'paused') && (
                    <button onClick={pauseAuction} className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
                      {auction.status === 'live' ? '⏸ Pause' : '▶️ Resume'}
                    </button>
                  )}
                  {auction.status !== 'completed' && (
                    <button onClick={endAuction} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                      End Auction
                    </button>
                  )}
                </div>
              )}

              {/* Sold Players */}
              <div className="bg-white rounded-xl shadow-sm border p-4">
                <h3 className="font-semibold text-gray-900 mb-3">Sold Players ({soldList.length})</h3>
                {soldList.length === 0 ? (
                  <p className="text-sm text-gray-500">No players sold yet.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {soldList.map(s => (
                      <div key={s.id} className="flex justify-between items-center text-sm border-b pb-2 last:border-0">
                        <div>
                          <span className="font-medium">{s.player?.name || 'Player'}</span>
                          <span className="text-gray-500 ml-2 text-xs">{s.player?.role}</span>
                        </div>
                        <div className="text-right">
                          <div className="font-medium text-green-700">₹{s.soldPrice.toLocaleString()}</div>
                          <div className="text-xs text-gray-500">{s.team?.name}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: Available Players + Teams Purse */}
            <div className="space-y-4">
              {/* Available Players (Admin selects) */}
              {user?.role === 'admin' && auction.status !== 'completed' && (
                <div className="bg-white rounded-xl shadow-sm border p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">
                    Available Players ({availablePlayers.length})
                  </h3>
                  {availablePlayers.length === 0 ? (
                    <p className="text-sm text-gray-500">No approved players left.</p>
                  ) : (
                    <div className="space-y-1 max-h-80 overflow-y-auto">
                      {availablePlayers.map(p => (
                        <button
                          key={p.id}
                          onClick={() => selectPlayer(p.id)}
                          disabled={!!currentPlayer}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex justify-between items-center"
                        >
                          <span className="font-medium">{p.name}</span>
                          <span className="text-xs text-gray-500">{p.role}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Teams Purse */}
              <div className="bg-white rounded-xl shadow-sm border p-4">
                <h3 className="font-semibold text-gray-900 mb-3">Teams Purse</h3>
                <div className="space-y-2">
                  {teams.map(t => (
                    <div key={t.id} className="flex justify-between items-center text-sm">
                      <span className={`font-medium ${t.id === auction.currentBidderTeamId ? 'text-indigo-700' : ''}`}>
                        {t.name}
                      </span>
                      <span className="text-green-700 font-medium">₹{t.remainingPurse.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
