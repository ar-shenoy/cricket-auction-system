import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { io, Socket } from 'socket.io-client';
import ThemeToggle from '../components/ThemeToggle';

interface Player {
  id: string;
  name: string;
  role: string;
  basePrice: number;
  city?: string;
  bio?: string;
  photoUrl?: string;
}

interface Team {
  id: string;
  name: string;
  remainingPurse: number;
}

interface Auction {
  id: string;
  name: string;
  status: string;
  currentPlayerId: string | null;
  currentBid: number;
  currentBidderTeamId: string | null;
  bidTimerSeconds: number;
  timerEndsAt: string | null;
}

export default function LiveViewer() {
  const [auction, setAuction] = useState<Auction | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [soldList, setSoldList] = useState<any[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [aRes, tRes] = await Promise.all([
          api.get('/auctions/active'),
          api.get('/teams')
        ]);
        setAuction(aRes.data);
        setTeams(tRes.data);
        if (aRes.data?.id) {
          const soldRes = await api.get(`/auctions/${aRes.data.id}/sold`);
          setSoldList(soldRes.data);
          if (aRes.data.currentPlayerId) {
            const pRes = await api.get(`/players/${aRes.data.currentPlayerId}`);
            setCurrentPlayer(pRes.data);
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!auction?.id) return;
    const socket = io(window.location.origin.includes('localhost')
      ? 'http://localhost:5000'
      : window.location.origin, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.emit('join-auction', auction.id);

    socket.on('player-selected', (data: any) => {
      setAuction(data.auction);
      setCurrentPlayer(data.player);
      setMessage(`Now auctioning: ${data.player.name}`);
    });
    socket.on('new-bid', (data: any) => {
      setAuction(data.auction);
      setMessage(`${data.team.name} bid ₹${data.bid.amount.toLocaleString()}`);
    });
    socket.on('player-sold', (data: any) => {
      setAuction(data.auction);
      setCurrentPlayer(null);
      setMessage(data.result.status === 'Sold'
        ? `SOLD! ${data.result.player?.name} → ${data.result.team?.name}`
        : `UNSOLD: ${data.result.player?.name}`);
      if (auction.id) {
        api.get(`/auctions/${auction.id}/sold`).then(r => setSoldList(r.data));
        api.get('/teams').then(r => setTeams(r.data));
      }
    });
    socket.on('auction-status', (data: any) => setAuction(data));
    socket.on('auction-ended', (data: any) => {
      setAuction(data);
      setCurrentPlayer(null);
      setMessage('Auction has ended');
    });

    return () => {
      socket.emit('leave-auction', auction.id);
      socket.disconnect();
    };
  }, [auction?.id]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (auction?.status === 'live' && auction.timerEndsAt && currentPlayer) {
      const tick = () => {
        const left = Math.max(0, Math.floor((new Date(auction.timerEndsAt!).getTime() - Date.now()) / 1000));
        setTimeLeft(left);
      };
      tick();
      timerRef.current = setInterval(tick, 250);
    } else setTimeLeft(0);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [auction?.timerEndsAt, auction?.status, currentPlayer]);

  const currentBidder = teams.find(t => t.id === auction?.currentBidderTeamId)?.name || '—';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏏</span>
            <div>
              <h1 className="font-bold text-gray-900 dark:text-white">Live Auction</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Public Viewer Mode</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link to="/login" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Login</Link>
          </div>
        </div>
      </header>

      {message && (
        <div className="max-w-5xl mx-auto px-4 mt-3">
          <div className="bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 px-4 py-2 rounded-lg text-sm">{message}</div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-6">
        {!auction || auction.status === 'draft' || auction.status === 'completed' ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-10 text-center text-gray-500 dark:text-gray-400">
            {auction?.status === 'completed' ? 'This auction has ended.' : 'Waiting for the auction to start...'}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow border dark:border-gray-700 overflow-hidden">
                {currentPlayer ? (
                  <div className="p-6">
                    <div className="flex flex-col sm:flex-row justify-between gap-4">
                      <div className="flex gap-4 items-start">
                        {currentPlayer.photoUrl ? (
                          <img src={currentPlayer.photoUrl} alt="" className="w-20 h-20 rounded-full object-cover border-2 border-blue-500" />
                        ) : (
                          <div className="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-3xl">🧔‍♂️</div>
                        )}
                        <div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">Now Auctioning</div>
                          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">{currentPlayer.name}</h2>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <span className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs px-2 py-1 rounded-full">{currentPlayer.role}</span>
                            {currentPlayer.city && <span className="bg-gray-100 dark:bg-gray-700 text-xs px-2 py-1 rounded-full">{currentPlayer.city}</span>}
                          </div>
                        </div>
                      </div>
                      <div className={`text-center px-5 py-3 rounded-xl ${timeLeft <= 5 ? 'bg-red-100 dark:bg-red-900/40' : 'bg-green-50 dark:bg-green-900/30'}`}>
                        <div className="text-xs uppercase text-gray-500">Time Left</div>
                        <div className={`text-4xl font-bold tabular-nums ${timeLeft <= 5 ? 'text-red-600' : 'text-green-700 dark:text-green-400'}`}>
                          {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 grid grid-cols-2 gap-4">
                      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-center">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Current Bid</div>
                        <div className="text-2xl font-bold">₹{(auction.currentBid || 0).toLocaleString()}</div>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-center">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Highest Bidder</div>
                        <div className="text-lg font-semibold text-indigo-600 dark:text-indigo-400">{currentBidder}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-12 text-center text-gray-500 dark:text-gray-400">
                    <div className="text-4xl mb-2">🏏</div>
                    Waiting for next player...
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow border dark:border-gray-700 p-4">
                <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">Recently Sold</h3>
                {soldList.length === 0 ? (
                  <p className="text-sm text-gray-500">No players sold yet.</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {soldList.slice().reverse().slice(0, 10).map((s: any) => (
                      <div key={s.id} className="flex justify-between text-sm border-b dark:border-gray-700 pb-2">
                        <span className="font-medium">{s.player?.name}</span>
                        <span className="text-green-600 dark:text-green-400">₹{s.soldPrice?.toLocaleString()} → {s.team?.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow border dark:border-gray-700 p-4 h-fit">
              <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">Teams Purse</h3>
              <div className="space-y-2">
                {teams.map(t => (
                  <div key={t.id} className="flex justify-between text-sm">
                    <span className={t.id === auction.currentBidderTeamId ? 'text-indigo-600 dark:text-indigo-400 font-medium' : ''}>
                      {t.name}
                    </span>
                    <span className="text-green-600 dark:text-green-400">₹{t.remainingPurse.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
