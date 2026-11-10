import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { publicApi, getSocketUrl } from '../services/api';
import { io, Socket } from 'socket.io-client';
import ThemeToggle from '../components/ThemeToggle';

interface Display {
  battingName?: string;
  bowlingName?: string;
  score?: string;
  overs?: string;
  crr?: string;
  rrr?: string | null;
  target?: number | null;
  ballsLeft?: number | null;
  thisOver?: string[];
  freeHit?: boolean;
  inPowerplay?: boolean;
  rainDelay?: boolean;
  abandoned?: boolean;
  superOver?: boolean;
  striker?: string | null;
  nonStriker?: string | null;
  bowler?: string | null;
  battingCard?: { name: string; runs: number; balls: number; fours?: number; sixes?: number; status: string; dismissalText?: string | null }[];
  bowlingCard?: { name: string; balls?: number; runs: number; wickets: number; maidens?: number; figures?: string }[];
  fallOfWickets?: { name: string; score: number; overs: string }[];
  resultText?: string | null;
}

interface Match {
  id: string;
  name: string;
  teamAName: string;
  teamBName: string;
  status: string;
  innings: number;
  innings1: { runs: number; wickets: number; balls: number };
  innings2: { runs: number; wickets: number; balls: number };
  result?: string | null;
  display?: Display;
}

function fmtOv(balls: number) {
  return `${Math.floor((balls || 0) / 6)}.${(balls || 0) % 6}`;
}

export default function MatchCentre() {
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'live' | 'batting' | 'bowling' | 'fow'>('live');
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
    const poll = setInterval(load, 4000);
    const socket = io(getSocketUrl(), { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('score-update', (data: Match) => {
      if (data?.id) setMatch(data);
    });
    return () => {
      clearInterval(poll);
      socket.disconnect();
    };
  }, [load]);

  const d = match?.display;

  if (loading) {
    return (
      <div className="min-h-screen page-mesh flex items-center justify-center">
        <div className="glass px-6 py-4 text-[14px]" style={{ color: 'var(--text-2)' }}>Loading match centre…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen page-mesh" style={{ color: 'var(--text)' }}>
      <header className="glass sticky top-0 z-20 border-b" style={{ borderColor: 'var(--separator)' }}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>Match centre</div>
            <div className="text-[15px] font-semibold truncate">{match?.name || 'No live match'}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link to="/points" className="text-[12px]" style={{ color: 'var(--text-2)' }}>Points</Link>
            <Link to="/scoreboard" className="text-[12px]" style={{ color: 'var(--text-2)' }}>Board</Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-4 pb-16">
        {!match && (
          <div className="glass p-10 text-center space-y-2">
            <div className="text-[18px] font-semibold">No live match</div>
            <p className="text-[13px]" style={{ color: 'var(--text-2)' }}>When scoring starts, this centre updates in real time — striker, bowler, FOW, and full cards.</p>
            <button type="button" onClick={load} className="as-btn-ghost text-sm mt-2">Refresh</button>
          </div>
        )}

        {match && (
          <>
            <div className="glass p-5">
              <div className="flex flex-wrap gap-2 mb-3">
                <span className="glass-island text-[11px] uppercase font-semibold" style={{
                  color: match.status === 'live' ? '#30d158' : match.status === 'rain_delay' ? '#64d2ff' : 'var(--text-2)'
                }}>
                  {match.status.replace(/_/g, ' ')}
                </span>
                {d?.inPowerplay && <span className="glass-island text-[11px] font-semibold" style={{ color: '#30d158' }}>Powerplay</span>}
                {d?.freeHit && <span className="glass-island text-[11px] font-semibold" style={{ color: '#ff9f0a' }}>Free hit</span>}
                {d?.superOver && <span className="glass-island text-[11px] font-semibold" style={{ color: 'var(--accent)' }}>Super Over</span>}
                {d?.rainDelay && <span className="glass-island text-[11px] font-semibold" style={{ color: '#64d2ff' }}>Rain delay</span>}
              </div>
              <div className="text-[13px]" style={{ color: 'var(--text-2)' }}>
                {d?.battingName || match.teamAName} batting
                {d?.bowlingName ? ` · ${d.bowlingName} bowling` : ''}
              </div>
              <div className="text-[42px] sm:text-[52px] font-semibold tabular-nums leading-none mt-1">{d?.score || '0/0'}</div>
              <div className="text-[15px] mt-2 tabular-nums" style={{ color: 'var(--text-2)' }}>
                {d?.overs || '0.0'} ov
                {d?.crr ? ` · CRR ${d.crr}` : ''}
                {d?.rrr && d.rrr !== '—' ? ` · RRR ${d.rrr}` : ''}
                {d?.target != null ? ` · Target ${d.target}` : ''}
                {d?.ballsLeft != null && match.innings === 2 ? ` · ${d.ballsLeft} balls left` : ''}
              </div>
              {(match.result || d?.resultText) && (
                <div className="mt-3 text-[14px] font-medium" style={{ color: '#30d158' }}>{match.result || d?.resultText}</div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="glass p-3">
                <div className="text-[11px] uppercase" style={{ color: 'var(--text-2)' }}>{match.teamAName}</div>
                <div className="text-[18px] font-semibold tabular-nums">
                  {match.innings1.runs}/{match.innings1.wickets}
                  <span className="text-[12px] font-normal ml-1" style={{ color: 'var(--text-2)' }}>({fmtOv(match.innings1.balls)})</span>
                </div>
              </div>
              <div className="glass p-3 text-right">
                <div className="text-[11px] uppercase" style={{ color: 'var(--text-2)' }}>{match.teamBName}</div>
                <div className="text-[18px] font-semibold tabular-nums">
                  {match.innings >= 2 || match.status === 'completed' ? (
                    <>
                      {match.innings2.runs}/{match.innings2.wickets}
                      <span className="text-[12px] font-normal ml-1" style={{ color: 'var(--text-2)' }}>({fmtOv(match.innings2.balls)})</span>
                    </>
                  ) : (
                    <span style={{ color: 'var(--text-2)' }}>Yet to bat</span>
                  )}
                </div>
              </div>
            </div>

            <div className="glass p-3">
              <div className="text-[11px] uppercase mb-2" style={{ color: 'var(--text-2)' }}>This over</div>
              <div className="flex flex-wrap gap-1.5">
                {(d?.thisOver || []).length === 0 && <span style={{ color: 'var(--text-2)' }}>—</span>}
                {(d?.thisOver || []).map((b, i) => (
                  <span key={i} className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold"
                    style={{
                      background: b === 'W' || String(b).startsWith('W') ? '#ff3b30' : b === '6' ? '#0a84ff' : b === '4' ? '#30d158' : 'var(--fill)',
                      color: b === 'W' || b === '6' || b === '4' || String(b).startsWith('W') ? '#fff' : 'var(--text)'
                    }}>{b}</span>
                ))}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-2">
              <div className="glass p-3">
                <div className="text-[11px] uppercase mb-2" style={{ color: 'var(--text-2)' }}>Batting</div>
                <div className="space-y-1 text-[14px]">
                  <div className="flex justify-between">
                    <span className="font-semibold" style={{ color: 'var(--accent)' }}>{d?.striker || '—'} *</span>
                    <span className="text-[12px]" style={{ color: 'var(--text-2)' }}>striker</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{d?.nonStriker || '—'}</span>
                    <span className="text-[12px]" style={{ color: 'var(--text-2)' }}>non-striker</span>
                  </div>
                </div>
              </div>
              <div className="glass p-3">
                <div className="text-[11px] uppercase mb-2" style={{ color: 'var(--text-2)' }}>Bowling</div>
                <div className="font-semibold text-[14px]">{d?.bowler || '—'}</div>
              </div>
            </div>

            <div className="flex gap-1.5 flex-wrap">
              {([['live', 'Live'], ['batting', 'Batting'], ['bowling', 'Bowling'], ['fow', 'FOW']] as const).map(([k, label]) => (
                <button key={k} type="button" className="glass-island text-[12px]"
                  style={tab === k ? { background: 'var(--accent)', color: '#fff' } : undefined}
                  onClick={() => setTab(k)}>{label}</button>
              ))}
            </div>

            {tab === 'batting' && (
              <div className="glass overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr style={{ color: 'var(--text-2)' }}>
                      <th className="text-left px-3 py-2 font-medium">Batter</th>
                      <th className="text-right px-2 py-2 font-medium">R</th>
                      <th className="text-right px-2 py-2 font-medium">B</th>
                      <th className="text-right px-2 py-2 font-medium">4s</th>
                      <th className="text-right px-3 py-2 font-medium">6s</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(d?.battingCard || []).map(b => (
                      <tr key={b.name} style={{ borderTop: '1px solid var(--separator)' }}>
                        <td className="px-3 py-2">
                          <div className="font-medium">{b.name}{b.name === d?.striker ? ' *' : ''}</div>
                          {b.status !== 'batting' && b.status !== 'not_out' && (
                            <div className="text-[11px]" style={{ color: 'var(--text-2)' }}>{b.dismissalText || b.status}</div>
                          )}
                        </td>
                        <td className="text-right px-2 tabular-nums">{b.runs}</td>
                        <td className="text-right px-2 tabular-nums">{b.balls}</td>
                        <td className="text-right px-2 tabular-nums">{b.fours ?? 0}</td>
                        <td className="text-right px-3 tabular-nums">{b.sixes ?? 0}</td>
                      </tr>
                    ))}
                    {(d?.battingCard || []).length === 0 && (
                      <tr><td colSpan={5} className="px-3 py-6 text-center" style={{ color: 'var(--text-2)' }}>No card yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'bowling' && (
              <div className="glass overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr style={{ color: 'var(--text-2)' }}>
                      <th className="text-left px-3 py-2 font-medium">Bowler</th>
                      <th className="text-right px-2 py-2 font-medium">O</th>
                      <th className="text-right px-2 py-2 font-medium">M</th>
                      <th className="text-right px-2 py-2 font-medium">R</th>
                      <th className="text-right px-3 py-2 font-medium">W</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(d?.bowlingCard || []).map(b => (
                      <tr key={b.name} style={{ borderTop: '1px solid var(--separator)' }}>
                        <td className="px-3 py-2 font-medium">{b.name}{b.name === d?.bowler ? ' *' : ''}</td>
                        <td className="text-right px-2 tabular-nums">{fmtOv(b.balls || 0)}</td>
                        <td className="text-right px-2 tabular-nums">{b.maidens ?? 0}</td>
                        <td className="text-right px-2 tabular-nums">{b.runs}</td>
                        <td className="text-right px-3 tabular-nums font-semibold">{b.wickets}</td>
                      </tr>
                    ))}
                    {(d?.bowlingCard || []).length === 0 && (
                      <tr><td colSpan={5} className="px-3 py-6 text-center" style={{ color: 'var(--text-2)' }}>No card yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'fow' && (
              <div className="glass p-4">
                {(d?.fallOfWickets || []).length === 0 && (
                  <div className="text-center text-[13px] py-4" style={{ color: 'var(--text-2)' }}>No wickets yet</div>
                )}
                <div className="space-y-2">
                  {(d?.fallOfWickets || []).map((f, i) => (
                    <div key={i} className="flex justify-between text-[13px] px-2 py-1.5 rounded-lg" style={{ background: 'var(--fill)' }}>
                      <span>{i + 1}. {f.name}</span>
                      <span className="tabular-nums">{f.score} ({f.overs} ov)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'live' && (
              <div className="text-[12px] text-center" style={{ color: 'var(--text-2)' }}>
                Auto-refreshing · open Batting / Bowling for full cards
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
