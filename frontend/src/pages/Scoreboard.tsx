import React, { useEffect, useState, useCallback, useRef } from 'react';
import { publicApi, getSocketUrl } from '../services/api';
import { io, Socket } from 'socket.io-client';

interface MatchDisplay {
  battingName: string;
  bowlingName: string;
  score: string;
  overs: string;
  crr: string;
  rrr: string | null;
  target: number | null;
  ballsLeft: number | null;
  thisOver: string[];
  freeHit?: boolean;
  inPowerplay?: boolean;
  powerplayOvers?: number;
  currentOver?: number;
  matchStatus?: string;
  rainDelay?: boolean;
  abandoned?: boolean;
  superOver?: boolean;
  revisedOvers?: number | null;
  dlsTarget?: number | null;
  resultText?: string | null;
  striker?: string | null;
  nonStriker?: string | null;
  bowler?: string | null;
  battingCard?: { name: string; runs: number; balls: number; status: string }[];
  bowlingCard?: { name: string; overs?: string; runs: number; wickets: number; figures?: string }[];
  fallOfWickets?: { name: string; score: number; overs: string }[];
}

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
  result?: string | null;
  display?: MatchDisplay;
}

export default function Scoreboard() {
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [projector, setProjector] = useState(true);
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString());
  const socketRef = useRef<Socket | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await publicApi.get('/matches/public/live');
      setMatch(res.data || null);
    } catch {
      setMatch(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, 5000);
    const tick = setInterval(() => setClock(new Date().toLocaleTimeString()), 1000);
    const socket = io(getSocketUrl(), { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('score-update', (data: Match) => {
      if (data?.id) setMatch(data);
    });
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      socket.disconnect();
    };
  }, [load]);

  useEffect(() => {
    if (projector) document.documentElement.requestFullscreen?.().catch(() => {});
  }, [projector]);

  const d = match?.display;
  const freeHit = !!d?.freeHit;

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-slate-400 flex items-center justify-center text-xl">
        Loading scoreboard…
      </div>
    );
  }

  if (!match) {
    return (
      <div className="min-h-screen bg-black text-slate-500 flex flex-col items-center justify-center gap-4">
        <div className="text-2xl">No live match</div>
        <button type="button" onClick={load} className="px-4 py-2 rounded-full bg-slate-800 text-slate-200 text-sm">
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col select-none">
      <div className="flex items-center justify-between px-4 sm:px-8 py-3 border-b border-slate-800">
        <div className="text-sm sm:text-base text-slate-400 truncate max-w-[50%]">{match.name}</div>
        <div className="flex items-center gap-3">
          {d?.inPowerplay && (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-600/30 text-emerald-400">POWERPLAY</span>
          )}
          {freeHit && (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-orange-500/30 text-orange-400 animate-pulse">FREE HIT</span>
          )}
          {d?.superOver && (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-600/30 text-blue-400">SUPER OVER</span>
          )}
          {d?.rainDelay && (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-sky-600/40 text-sky-300">RAIN DELAY</span>
          )}
          {match.status === 'abandoned' && (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-600/40 text-red-300">ABANDONED</span>
          )}
          <span className="text-slate-500 text-sm tabular-nums hidden sm:inline">{clock}</span>
          <button type="button" onClick={() => setProjector(p => !p)} className="text-xs px-3 py-1 rounded-full bg-slate-800 text-slate-300">
            {projector ? 'Exit FS' : 'Fullscreen'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        {match.result && (
          <div className="mb-6 text-center text-xl sm:text-3xl font-semibold text-emerald-400">{match.result}</div>
        )}

        <div className="text-slate-400 text-sm sm:text-lg uppercase tracking-widest mb-2">
          {d?.battingName}
          <span className="text-slate-600 mx-2">vs</span>
          {d?.bowlingName}
        </div>

        <div className="text-6xl sm:text-8xl md:text-9xl font-black tabular-nums tracking-tight leading-none">
          {d?.score}
        </div>

        <div className="mt-4 text-2xl sm:text-4xl text-slate-300 tabular-nums">({d?.overs} ov)</div>

        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-10 text-center">
          <div>
            <div className="text-xs text-slate-500 uppercase">CRR</div>
            <div className="text-2xl sm:text-3xl font-bold text-slate-200">{d?.crr}</div>
          </div>
          {d?.target != null && (
            <div>
              <div className="text-xs text-slate-500 uppercase">Target</div>
              <div className="text-2xl sm:text-3xl font-bold text-amber-400">{d.target}</div>
            </div>
          )}
          {d?.rrr && d.rrr !== '—' && (
            <div>
              <div className="text-xs text-slate-500 uppercase">RRR</div>
              <div className="text-2xl sm:text-3xl font-bold text-slate-200">{d.rrr}</div>
            </div>
          )}
          {d?.ballsLeft != null && match.innings === 2 && (
            <div>
              <div className="text-xs text-slate-500 uppercase">Balls left</div>
              <div className="text-2xl sm:text-3xl font-bold text-slate-200">{d.ballsLeft}</div>
            </div>
          )}
          {d?.revisedOvers != null && (
            <div>
              <div className="text-xs text-slate-500 uppercase">Revised</div>
              <div className="text-2xl sm:text-3xl font-bold text-sky-400">{d.revisedOvers} ov</div>
            </div>
          )}
        </div>

        <div className="mt-10 flex flex-wrap justify-center gap-2 max-w-xl">
          <span className="text-slate-500 text-sm self-center mr-2">This over</span>
          {(d?.thisOver || []).length === 0 && <span className="text-slate-600">—</span>}
          {(d?.thisOver || []).map((b, i) => (
            <span
              key={i}
              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-sm sm:text-base font-bold ${
                b === 'W' || b.startsWith('W')
                  ? 'bg-red-600'
                  : b === '6'
                  ? 'bg-blue-600'
                  : b === '4'
                  ? 'bg-emerald-600'
                  : b.startsWith('Wd') || b.startsWith('Nb')
                  ? 'bg-orange-500'
                  : b === 'DB'
                  ? 'bg-slate-600'
                  : 'bg-slate-700'
              }`}
            >
              {b}
            </span>
          ))}
        </div>
      </div>

      {(d?.striker || d?.bowler || (d?.battingCard && d.battingCard.length > 0)) && (
        <div className="px-4 sm:px-8 pb-6 max-w-4xl mx-auto w-full grid sm:grid-cols-3 gap-4 text-sm">
          <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4">
            <div className="text-xs text-slate-500 uppercase mb-2">Batting</div>
            <div className="space-y-1">
              {(d?.battingCard || []).filter(b => b.status === 'batting' || b.status === 'not_out').slice(0, 2).map(b => (
                <div key={b.name} className="flex justify-between tabular-nums">
                  <span className={b.name === d?.striker ? 'text-amber-300 font-semibold' : 'text-slate-200'}>
                    {b.name}{b.name === d?.striker ? ' *' : ''}
                  </span>
                  <span>{b.runs} ({b.balls})</span>
                </div>
              ))}
              {!d?.battingCard?.length && (
                <>
                  <div className="flex justify-between"><span className="text-amber-300">{d?.striker || '—'} *</span><span className="text-slate-500">striker</span></div>
                  <div className="flex justify-between"><span>{d?.nonStriker || '—'}</span><span className="text-slate-500">non-striker</span></div>
                </>
              )}
            </div>
          </div>
          <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4">
            <div className="text-xs text-slate-500 uppercase mb-2">Bowling</div>
            <div className="text-slate-200 font-semibold">{d?.bowler || '—'}</div>
            {(d?.bowlingCard || []).filter(b => b.name === d?.bowler).slice(0, 1).map(b => (
              <div key={b.name} className="text-slate-400 mt-1 tabular-nums">{b.figures || `${b.overs}-${b.runs}-${b.wickets}`}</div>
            ))}
          </div>
          <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4">
            <div className="text-xs text-slate-500 uppercase mb-2">Fall of wickets</div>
            <div className="text-slate-300 text-xs leading-relaxed">
              {(d?.fallOfWickets || []).length === 0 && <span className="text-slate-600">—</span>}
              {(d?.fallOfWickets || []).map((f, i) => (
                <span key={i}>{f.score}-{i + 1}{i < (d?.fallOfWickets?.length || 0) - 1 ? ' · ' : ''}</span>
              ))}
            </div>
          </div>
        </div>
      )}

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
            {match.innings >= 2 || match.status === 'completed' || match.status === 'abandoned' ? (
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
