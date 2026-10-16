import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicApi } from '../services/api';
import ThemeToggle from '../components/ThemeToggle';

interface Row {
  rank: number;
  teamId: string | null;
  teamName: string;
  logoUrl?: string | null;
  played: number;
  won: number;
  lost: number;
  tied?: number;
  nr?: number;
  points: number;
  nrr?: number;
}

interface Recent {
  id: string;
  team1Name?: string;
  team2Name?: string;
  result?: string;
  status?: string;
}

export default function PointsTable() {
  const [rows, setRows] = useState<Row[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    publicApi
      .get('/matches/public/points')
      .then(r => {
        setRows(r.data?.table || r.data?.points || r.data || []);
        setRecent(r.data?.recent || r.data?.matches || []);
      })
      .catch(() => {
        setRows([]);
        setRecent([]);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page-mesh min-h-screen" style={{ color: 'var(--text)' }}>
      <header className="glass-nav">
        <div className="max-w-4xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Link to="/welcome" className="text-[20px]">🏏</Link>
            <div>
              <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>Tournament</div>
              <h1 className="font-semibold text-[17px]" style={{ color: 'var(--text)' }}>Points table</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[13px]">
            <ThemeToggle />
            <Link to="/live" style={{ color: 'var(--text-2)' }}>Live</Link>
            <Link to="/results" style={{ color: 'var(--text-2)' }}>Results</Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        <div className="glass overflow-hidden">
          {loading ? (
            <p className="p-8 text-center text-[14px]" style={{ color: 'var(--text-2)' }}>Loading…</p>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-[14px]" style={{ color: 'var(--text-2)' }}>No standings yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Team</th>
                  <th>P</th>
                  <th>W</th>
                  <th>L</th>
                  <th>Pts</th>
                  <th>NRR</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.teamId || i}>
                    <td style={{ color: 'var(--text-2)' }}>{r.rank ?? i + 1}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        {r.logoUrl ? (
                          <img src={r.logoUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                        ) : null}
                        <span className="font-medium">{r.teamName}</span>
                      </div>
                    </td>
                    <td>{r.played}</td>
                    <td>{r.won}</td>
                    <td>{r.lost}</td>
                    <td className="font-semibold">{r.points}</td>
                    <td style={{ color: 'var(--text-2)' }}>
                      {r.nrr != null ? Number(r.nrr).toFixed(3) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {recent.length > 0 && (
          <div className="glass overflow-hidden">
            <div className="px-4 pt-4 pb-2 font-semibold text-[17px]">Recent results</div>
            {recent.slice(0, 10).map(m => (
              <div key={m.id} className="glass-row">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-[14px] truncate">
                    {m.team1Name || 'Team A'} vs {m.team2Name || 'Team B'}
                  </div>
                  <div className="text-[13px]" style={{ color: 'var(--text-2)' }}>
                    {m.result || m.status || '—'}
                  </div>
                </div>
                <Link to={`/match/${m.id}`} className="text-[13px] font-medium" style={{ color: 'var(--accent)' }}>
                  View
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
