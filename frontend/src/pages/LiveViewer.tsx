import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { publicApi, getSocketUrl } from '../services/api';
import { io, Socket } from 'socket.io-client';
import ThemeToggle from '../components/ThemeToggle';
import { startKeepAliveInterval } from '../utils/keepAlive';

interface Player {
  id: string;
  name: string;
  role: string;
  basePrice: number;
  city?: string;
  bio?: string;
  photoUrl?: string;
  battingStyle?: string;
  bowlingStyle?: string;
  age?: number | null;
}

interface Team {
  id: string;
  name: string;
  remainingPurse: number;
  logoUrl?: string;
}

interface Auction {
  id: string;
  name: string;
  status: string;
  currentPlayerId: string | null;
  currentBid: number;
  currentBidderTeamId: string | null;
}

export default function LiveViewer() {
  const [auction, setAuction] = useState<Auction | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [soldList, setSoldList] = useState<any[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/live` : '/live';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt('Copy this link:', shareUrl);
    }
  };

  useEffect(() => {
    const stop = startKeepAliveInterval();
    return stop;
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const [aRes, tRes] = await Promise.all([
          publicApi.get('/auctions/public/active'),
          publicApi.get('/teams')
        ]);
        setAuction(aRes.data);
        setTeams(tRes.data);
        if (aRes.data?.id) {
          const soldRes = await publicApi.get(`/auctions/${aRes.data.id}/public/sold`);
          setSoldList(soldRes.data);
          if (aRes.data.currentPlayerId) {
            try {
              const pRes = await publicApi.get(`/players/public/${aRes.data.currentPlayerId}`);
              setCurrentPlayer(pRes.data);
            } catch {
              /* ignore */
            }
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    load();
    const poll = setInterval(load, 15000);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    if (!auction?.id) return;
    const socket = io(getSocketUrl(), { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.emit('join-auction', auction.id);

    socket.on('player-selected', (data: any) => {
      setAuction(data.auction);
      setCurrentPlayer(data.player);
      setMessage(`Now auctioning: ${data.player.name}`);
    });
    socket.on('new-bid', (data: any) => {
      setAuction(data.auction);
      setMessage(`${data.team.name} bid Rs ${data.bid.amount.toLocaleString()}`);
    });
    socket.on('player-sold', (data: any) => {
      setAuction(data.auction);
      setCurrentPlayer(null);
      setMessage(
        data.result.status === 'Sold'
          ? `SOLD! ${data.result.player?.name} -> ${data.result.team?.name}`
          : `UNSOLD: ${data.result.player?.name}`
      );
      publicApi.get(`/auctions/${auction.id}/public/sold`).then(r => setSoldList(r.data));
      publicApi.get('/teams').then(r => setTeams(r.data));
    });
    socket.on('auction-status', (data: any) => setAuction(data));
    socket.on('auction-started', (data: any) => setAuction(data));
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

  const currentBidder = teams.find(t => t.id === auction?.currentBidderTeamId)?.name || '-';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-2xl">🏏</span>
            <div className="min-w-0">
              <h1 className="font-bold text-gray-900 dark:text-white truncate">{auction?.name || 'Live Auction'}</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Public viewer · no login needed</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={copyLink} className="text-xs sm:text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg">{copied ? 'Copied!' : 'Share link'}</button>
            <ThemeToggle />
            <Link to="/login" className="text-sm text-blue-600 dark:text-blue-400 hover:underline hidden sm:inline">Login</Link>
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
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-10 text-center text-gray-500 dark:text-gray-400 border dark:border-gray-700">
            {auction?.status === 'completed' ? 'This auction has ended.' : 'Waiting for the auction to go live...'}
            <p className="text-xs mt-3 text-gray-400">Share this page: {shareUrl}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow border dark:border-gray-700 overflow-hidden">
                {currentPlayer ? (
                  <div className="p-6">
                    <div className="flex gap-4 items-start">
                      {currentPlayer.photoUrl ? (
                        <img src={currentPlayer.photoUrl} alt="" className="w-20 h-20 rounded-full object-cover border-2 border-blue-500" />
                      ) : (
                        <div className="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-3xl">🏏</div>
                      )}
                      <div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Now Auctioning</div>
                        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">{currentPlayer.name}</h2>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs px-2 py-1 rounded-full">{currentPlayer.role}</span>
                          {currentPlayer.city && <span className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs px-2 py-1 rounded-full">{currentPlayer.city}</span>}
                          <span className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs px-2 py-1 rounded-full">Base Rs {(currentPlayer.basePrice || 0).toLocaleString()}</span>
                        </div>
                        {(currentPlayer.age != null || currentPlayer.battingStyle || currentPlayer.bowlingStyle) && (
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-300">
                            {currentPlayer.age != null && <span>Age: <strong>{currentPlayer.age}</strong></span>}
                            {currentPlayer.battingStyle && <span>Bat: <strong>{currentPlayer.battingStyle}</strong></span>}
                            {currentPlayer.bowlingStyle && <span>Bowl: <strong>{currentPlayer.bowlingStyle}</strong></span>}
                          </div>
                        )}
                        {currentPlayer.bio && <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{currentPlayer.bio}</p>}
                      </div>
                    </div>
                    <div className="mt-6 grid grid-cols-2 gap-4">
                      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-center">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Current Bid</div>
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">Rs {(auction.currentBid || 0).toLocaleString()}</div>
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
                  <p className="text-sm text-gray-500 dark:text-gray-400">No players sold yet.</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {soldList.slice().reverse().slice(0, 15).map((s: any) => (
                      <div key={s.id} className="flex justify-between text-sm border-b dark:border-gray-700 pb-2 text-gray-800 dark:text-gray-200">
                        <span className="font-medium">{s.player?.name}</span>
                        <span className="text-green-600 dark:text-green-400">Rs {s.soldPrice?.toLocaleString()} → {s.team?.name}</span>
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
                  <div key={t.id} className="flex justify-between items-center text-sm text-gray-800 dark:text-gray-200 gap-2">
                    <span className={`flex items-center gap-2 min-w-0 ${t.id === auction.currentBidderTeamId ? 'text-indigo-600 dark:text-indigo-400 font-medium' : ''}`}>
                      {t.logoUrl ? <img src={t.logoUrl} alt="" className="w-6 h-6 rounded object-cover shrink-0" /> : <span className="text-base shrink-0">🏏</span>}
                      <span className="truncate">{t.name}</span>
                    </span>
                    <span className="text-green-600 dark:text-green-400 shrink-0">Rs {t.remainingPurse.toLocaleString()}</span>
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
