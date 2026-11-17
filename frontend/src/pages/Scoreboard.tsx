import React, { useEffect, useState, useCallback, useRef } from 'react';
import { publicApi, getSocketUrl } from '../services/api';
import { io, Socket } from 'socket.io-client';

interface MatchDisplay {
  battingName: string; bowlingName: string; score: string; overs: string; crr: string;
  rrr: string | null; target: number | null; ballsLeft: number | null; thisOver: string[];
  freeHit?: boolean; inPowerplay?: boolean; rainDelay?: boolean; abandoned?: boolean; superOver?: boolean;
  striker?: string | null; nonStriker?: string | null; bowler?: string | null;
  battingCard?: { name: string; runs: number; balls: number; status: string }[];
  bowlingCard?: { name: string; overs?: string; runs: number; wickets: number; figures?: string }[];
  fallOfWickets?: { name: string; score: number; overs: string }[];
}

interface Match {
  id: string; name: string; teamAName: string; teamBName: string; oversLimit: number; innings: number;
  status: string; innings1: { runs: number; wickets: number; balls: number }; innings2: { runs: number; wickets: number; balls: number };
  result?: string | null; display?: MatchDisplay;
}

type FlashKind = 'FOUR' | 'SIX' | 'WICKET' | 'WIDE' | 'NOBALL' | null;

function classifyEvent(label: string): FlashKind {
  const u = (label || '').toUpperCase().replace(/\s/g, '');
  if (u === '6' || u.includes('SIX')) return 'SIX';
  if (u === '4' || u.includes('FOUR')) return 'FOUR';
  if (u === 'W' || u.includes('WKT') || u.includes('OUT')) return 'WICKET';
  if (u.includes('WD') || u.includes('WIDE')) return 'WIDE';
  if (u.includes('NB') || u.includes('NOBALL')) return 'NOBALL';
  return null;
}

const FLASH_STYLE: Record<string, { bg: string; label: string }> = {
  FOUR: { bg: 'from-sky-600/90 to-blue-800/90', label: 'FOUR' },
  SIX: { bg: 'from-violet-600/90 to-purple-900/90', label: 'SIX' },
  WICKET: { bg: 'from-red-600/95 to-rose-900/95', label: 'WICKET' },
  WIDE: { bg: 'from-amber-500/90 to-orange-700/90', label: 'WIDE' },
  NOBALL: { bg: 'from-orange-500/90 to-red-700/90', label: 'NO BALL' }
};

export default function Scoreboard() {
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [projector, setProjector] = useState(true);
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString());
  const [flash, setFlash] = useState<FlashKind>(null);
  const [brand, setBrand] = useState<any>(null);
  const socketRef = useRef<Socket | null>(null);
  const prevOverRef = useRef('');

  const load = useCallback(async () => {
    try {
      const res = await publicApi.get('/matches/public/live');
      setMatch(res.data || null);
    } catch { setMatch(null); }
    finally { setLoading(false); }
  }, []);

  const loadBrand = useCallback(async () => {
    try {
      const r = await fetch(`${getSocketUrl()}/api/broadcast/public/lower-thirds`);
      const data = await r.json();
      setBrand(data?.brand || null);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    load(); loadBrand();
    const poll = setInterval(load, 5000);
    const brandPoll = setInterval(loadBrand, 15000);
    const tick = setInterval(() => setClock(new Date().toLocaleTimeString()), 1000);
    const socket = io(getSocketUrl(), { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('score-update', (data: Match) => { if (data?.id) setMatch(data); });
    return () => { clearInterval(poll); clearInterval(brandPoll); clearInterval(tick); socket.disconnect(); };
  }, [load, loadBrand]);

  useEffect(() => {
    const over = match?.display?.thisOver || [];
    const key = over.join('|');
    if (!key || key === prevOverRef.current) return;
    const prev = prevOverRef.current ? prevOverRef.current.split('|').filter(Boolean) : [];
    prevOverRef.current = key;
    if (over.length > prev.length) {
      const kind = classifyEvent(over[over.length - 1]);
      if (kind) {
        setFlash(kind);
        const t = setTimeout(() => setFlash(null), kind === 'WICKET' || kind === 'SIX' ? 2200 : 1400);
        return () => clearTimeout(t);
      }
    }
  }, [match?.display?.thisOver]);

  useEffect(() => {
    if (projector) document.documentElement.requestFullscreen?.().catch(() => {});
  }, [projector]);

  const d = match?.display;
  const freeHit = !!d?.freeHit;
  const placements: { url: string; position: string }[] =
    brand?.sponsorPlacements?.length ? brand.sponsorPlacements
      : (brand?.sponsorLogos || []).map((url: string) => ({ url, position: 'bottom' }));
  const showSponsors = brand?.showSponsors !== false && placements.length > 0;
  const byPos = (pos: string) => placements.filter(p => p.position === pos);

  if (loading) {
    return <div className="min-h-screen bg-black text-slate-400 flex items-center justify-center text-xl">Loading scoreboard…</div>;
  }
  if (!match) {
    return (
      <div className="min-h-screen bg-black text-slate-500 flex flex-col items-center justify-center gap-4">
        <div className="text-2xl">No live match</div>
        <button type="button" onClick={load} className="px-4 py-2 rounded-full bg-slate-800 text-slate-200 text-sm">Refresh</button>
      </div>
    );
  }

  const flashCfg = flash ? FLASH_STYLE[flash] : null;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col select-none relative overflow-hidden">
      {flashCfg && (
        <div className={`pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-gradient-to-br ${flashCfg.bg}`}>
          <div className="text-6xl sm:text-8xl font-black tracking-widest text-white drop-shadow-2xl">{flashCfg.label}</div>
        </div>
      )}

      {showSponsors && byPos('top').length > 0 && (
        <div className="flex items-center justify-center gap-6 py-2 bg-slate-950 border-b border-slate-800">
          {byPos('top').map((p, i) => <img key={i} src={p.url} alt="" className="h-7 object-contain opacity-90" />)}
        </div>
      )}

      <div className="flex items-center justify-between px-4 sm:px-8 py-3 border-b border-slate-800 bg-gradient-to-r from-slate-950 to-slate-900">
        <div className="flex items-center gap-3 min-w-0">
          {brand?.logoUrl && <img src={brand.logoUrl} alt="" className="h-8 w-8 object-contain rounded" />}
          <div className="text-sm sm:text-base text-slate-300 truncate font-medium">{brand?.title || match.name}</div>
        </div>
        <div className="flex items-center gap-3">
          {d?.inPowerplay && <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-600/30 text-emerald-400">POWERPLAY</span>}
          {freeHit && <span className="px-3 py-1 rounded-full text-xs font-bold bg-orange-500/30 text-orange-400 animate-pulse">FREE HIT</span>}
          {d?.superOver && <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-600/30 text-blue-400">SUPER OVER</span>}
          {d?.rainDelay && <span className="px-3 py-1 rounded-full text-xs font-bold bg-sky-600/40 text-sky-300">RAIN DELAY</span>}
          <span className="text-slate-500 text-sm tabular-nums hidden sm:inline">{clock}</span>
          <button type="button" onClick={() => setProjector(p => !p)} className="text-xs px-3 py-1 rounded-full bg-slate-800 text-slate-300">{projector ? 'Exit FS' : 'Fullscreen'}</button>
        </div>
      </div>

      <div className="flex-1 flex">
        {showSponsors && byPos('left').length > 0 && (
          <div className="hidden md:flex flex-col items-center justify-center gap-4 px-2 border-r border-slate-800 bg-slate-950/50">
            {byPos('left').map((p, i) => <img key={i} src={p.url} alt="" className="w-12 object-contain opacity-80" />)}
          </div>
        )}

        <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
          {match.result && <div className="mb-6 text-center text-xl sm:text-3xl font-semibold text-emerald-400">{match.result}</div>}
          <div className="text-center mb-2">
            <div className="text-slate-400 text-sm sm:text-base uppercase tracking-wide">{d?.battingName || 'Batting'}</div>
            <div className="text-6xl sm:text-8xl font-black tabular-nums tracking-tight mt-1" style={{ color: brand?.accentColor || '#fff' }}>{d?.score || '0/0'}</div>
            <div className="text-2xl sm:text-3xl text-slate-400 tabular-nums mt-1">
              ({d?.overs || '0.0'})
              {d?.target != null && <span className="ml-3 text-amber-400 text-lg">Target {d.target}</span>}
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-6 mt-6 text-center">
            <div><div className="text-xs text-slate-500 uppercase">CRR</div><div className="text-xl font-semibold tabular-nums">{d?.crr || '—'}</div></div>
            {d?.rrr != null && <div><div className="text-xs text-slate-500 uppercase">RRR</div><div className="text-xl font-semibold tabular-nums text-amber-400">{d.rrr}</div></div>}
            {d?.ballsLeft != null && <div><div className="text-xs text-slate-500 uppercase">Balls left</div><div className="text-xl font-semibold tabular-nums">{d.ballsLeft}</div></div>}
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {(d?.thisOver || []).map((ball, i) => (
              <span key={i} className={`min-w-[2rem] h-8 px-2 rounded-lg flex items-center justify-center text-sm font-bold tabular-nums ${
                ball === '4' || ball === '6' ? 'bg-sky-600 text-white' : ball === 'W' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-200'
              }`}>{ball}</span>
            ))}
            {(d?.thisOver || []).length === 0 && <span className="text-slate-600 text-sm">This over…</span>}
          </div>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-3xl">
            <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4">
              <div className="text-xs text-slate-500 uppercase mb-2">Batting</div>
              <div className="text-slate-200 font-semibold">{d?.striker || '—'} *</div>
              <div className="text-slate-400 text-sm mt-1">{d?.nonStriker || '—'}</div>
            </div>
            <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4">
              <div className="text-xs text-slate-500 uppercase mb-2">Bowling</div>
              <div className="text-slate-200 font-semibold">{d?.bowler || '—'}</div>
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
        </div>

        {showSponsors && byPos('right').length > 0 && (
          <div className="hidden md:flex flex-col items-center justify-center gap-4 px-2 border-l border-slate-800 bg-slate-950/50">
            {byPos('right').map((p, i) => <img key={i} src={p.url} alt="" className="w-12 object-contain opacity-80" />)}
          </div>
        )}
      </div>

      {showSponsors && byPos('corner')[0] && (
        <div className="absolute bottom-24 right-4 z-20">
          <img src={byPos('corner')[0].url} alt="" className="h-14 object-contain opacity-90" />
        </div>
      )}

      <div className="border-t border-slate-800 grid grid-cols-2 divide-x divide-slate-800 bg-slate-950">
        <div className="p-4 sm:p-6">
          <div className="text-xs text-slate-500 uppercase mb-1">{match.teamAName}</div>
          <div className="text-xl sm:text-3xl font-bold tabular-nums">
            {match.innings1.runs}/{match.innings1.wickets}
            <span className="text-slate-500 text-sm sm:text-lg font-normal ml-2">({Math.floor(match.innings1.balls / 6)}.{match.innings1.balls % 6})</span>
          </div>
        </div>
        <div className="p-4 sm:p-6 text-right">
          <div className="text-xs text-slate-500 uppercase mb-1">{match.teamBName}</div>
          <div className="text-xl sm:text-3xl font-bold tabular-nums">
            {match.innings >= 2 || match.status === 'completed' || match.status === 'abandoned' ? (
              <>{match.innings2.runs}/{match.innings2.wickets}<span className="text-slate-500 text-sm sm:text-lg font-normal ml-2">({Math.floor(match.innings2.balls / 6)}.{match.innings2.balls % 6})</span></>
            ) : <span className="text-slate-600">Yet to bat</span>}
          </div>
        </div>
      </div>

      {showSponsors && byPos('bottom').length > 0 && (
        <div className="flex items-center justify-center gap-8 py-2.5 bg-slate-950 border-t border-slate-800">
          {byPos('bottom').map((p, i) => <img key={i} src={p.url} alt="" className="h-6 object-contain opacity-85" />)}
        </div>
      )}
    </div>
  );
}
