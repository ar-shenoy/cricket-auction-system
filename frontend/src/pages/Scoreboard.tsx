import React, { useEffect, useState, useRef } from 'react';
import { publicApi, getSocketUrl } from '../services/api';
import { io, Socket } from 'socket.io-client';

interface Match {
  id: string;
  name: string;
  teamAName: string;
  teamBName: string;
  oversLimit: number;
  innings: number;
  status: string;
  innings1: { runs: number; wickets: number; balls: number };
  innings2: { runs: number; wickets: number; balls: number };
  display?: {
    battingName: string;
    bowlingName: string;
    score: string;
    overs: string;
    crr: string;
    rrr: string | null;
    target: number | null;
    ballsLeft: number | null;
    thisOver: string[];
  };
}

export default function Scoreboard() {
  const [match, setMatch] = useState<Match | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const prevScore = useRef<string>('');

  const load = async () => {
    try {
      const res = await publicApi.get('/matches/public/live');
      setMatch(res.data);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    load();
    const poll = setInterval(load, 5000);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    const socket = io(getSocketUrl(), { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('score-update', (data: Match) => {
      if (data?.display?.score && data.display.score !== prevScore.current) {
        prevScore.current = data.display.score;
        const last = data.display.thisOver?.[data.display.thisOver.length - 1];
        if (last === '4' || last === '6') {
          setFlash(last === '6' ? 'SIX!' : 'FOUR!');
          setTimeout(() => setFlash(null), 1800);
        } else if (last === 'W') {
          setFlash('WICKET!');
          setTimeout(() => setFlash(null), 1800);
        }
      }
      setMatch(data);
      if (data?.id) socket.emit('join-match', data.id);
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  const d = match?.display;

  if (!match) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-8">
        <div className="text-6xl mb-4">🏏</div>
        <div className="text-2xl text-slate-400">Waiting for live match...</div>
        <p className="text-slate-600 mt-4 text-sm">Open Scoring panel and start a match</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col relative overflow-hidden">
      {flash && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div
            className={`text-7xl sm:text-9xl font-black tracking-tight animate-pulse ${
              flash === 'WICKET!' ? 'text-red-500' : flash === 'SIX!' ? 'text-blue-400' : 'text-emerald-400'
            }`}
          >
            {flash}
          </div>
        </div>
      )}

      <div className="px-6 py-4 flex justify-between items-center border-b border-slate-800">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏏</span>
          <div>
            <div className="font-bold text-lg sm:text-xl truncate max-w-[50vw]">{match.name}</div>
            <div className="text-xs text-slate-500 uppercase tracking-widest">
              {match.status === 'completed' ? 'Result' : `Innings ${match.innings}`} · {match.oversLimit} overs
            </div>
          </div>
        </div>
        {match.status === 'live' && (
          <span className="flex items-center gap-2 text-red-400 font-bold text-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            LIVE
          </span>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="text-slate-400 text-sm sm:text-lg uppercase tracking-[0.2em] mb-2">
          {d?.battingName}
        </div>
        <div className="text-7xl sm:text-9xl font-black tabular-nums tracking-tight leading-none">
          {d?.score || '0/0'}
        </div>
        <div className="mt-4 text-2xl sm:text-4xl text-slate-300 tabular-nums">
          ({d?.overs || '0.0'} overs)
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-6 text-center">
          <div>
            <div className="text-xs text-slate-500 uppercase">CRR</div>
            <div className="text-2xl sm:text-3xl font-bold text-indigo-400">{d?.crr || '0.00'}</div>
          </div>
          {d?.target != null && (
            <>
              <div>
                <div className="text-xs text-slate-500 uppercase">Target</div>
                <div className="text-2xl sm:text-3xl font-bold text-amber-400">{d.target}</div>
              </div>
              {d.rrr != null && (
                <div>
                  <div className="text-xs text-slate-500 uppercase">RRR</div>
                  <div className="text-2xl sm:text-3xl font-bold text-rose-400">{d.rrr}</div>
                </div>
              )}
              {d.ballsLeft != null && (
                <div>
                  <div className="text-xs text-slate-500 uppercase">Balls left</div>
                  <div className="text-2xl sm:text-3xl font-bold text-slate-200">{d.ballsLeft}</div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-10 flex flex-wrap justify-center gap-2 max-w-xl">
          <span className="text-slate-500 text-sm self-center mr-2">This over</span>
          {(d?.thisOver || []).length === 0 && <span className="text-slate-600">—</span>}
          {(d?.thisOver || []).map((b, i) => (
            <span
              key={i}
              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-sm sm:text-base font-bold ${
                b === 'W'
                  ? 'bg-red-600'
                  : b === '4' || b === '6'
                  ? b === '6'
                    ? 'bg-blue-600'
                    : 'bg-emerald-600'
                  : b.startsWith('Wd') || b.startsWith('Nb')
                  ? 'bg-orange-500'
                  : 'bg-slate-700'
              }`}
            >
              {b}
            </span>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-800 grid grid-cols-2 divide-x divide-slate-800">
        <div className="p-4 sm:p-6">
          <div className="text-xs text-slate-500 uppercase mb-1">{match.teamAName}</div>
          <div className="text-xl sm:text-3xl font-bold tabular-nums">
            {match.innings1.runs}/{match.innings1.wickets}
            <span className="text-slate-500 text-sm sm:text-lg font-normal ml-2">
              ({Math.floor(match.innings1.balls / 6)}.{match.innings1.balls % 6})
            </span>
          </div>
        </div>
        <div className="p-4 sm:p-6 text-right">
          <div className="text-xs text-slate-500 uppercase mb-1">{match.teamBName}</div>
          <div className="text-xl sm:text-3xl font-bold tabular-nums">
            {match.innings >= 2 || match.status === 'completed' ? (
              <>
                {match.innings2.runs}/{match.innings2.wickets}
                <span className="text-slate-500 text-sm sm:text-lg font-normal ml-2">
                  ({Math.floor(match.innings2.balls / 6)}.{match.innings2.balls % 6})
                </span>
              </>
            ) : (
              <span className="text-slate-600">Yet to bat</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
