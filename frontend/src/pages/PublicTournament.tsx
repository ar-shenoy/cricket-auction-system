import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicApi } from '../services/api';
import ThemeToggle from '../components/ThemeToggle';

export default function PublicTournament() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    publicApi.get('/tournaments/public')
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="min-h-screen page-mesh flex items-center justify-center" style={{ color: 'var(--text-2)' }}>Loading tournament…</div>;
  }

  return (
    <div className="min-h-screen page-mesh" style={{ color: 'var(--text)' }}>
      <header className="glass sticky top-0 z-10 border-b" style={{ borderColor: 'var(--separator)' }}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex justify-between items-center">
          <div>
            <div className="text-[11px] uppercase font-semibold" style={{ color: 'var(--accent)' }}>Tournament hub</div>
            <div className="font-semibold text-[16px]">{data?.org?.name || 'League'}{data?.tournament ? ` · ${data.tournament.name}` : ''}</div>
          </div>
          <div className="flex gap-2 items-center">
            <Link to="/match-live" className="text-[12px]" style={{ color: 'var(--text-2)' }}>Match</Link>
            <Link to="/points" className="text-[12px]" style={{ color: 'var(--text-2)' }}>Points</Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        {data?.liveMatch && (
          <a href="/match-live" className="glass p-4 block" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="text-[11px] uppercase font-semibold" style={{ color: '#30d158' }}>Live now</div>
            <div className="font-semibold text-[17px] mt-1">{data.liveMatch.teamAName} vs {data.liveMatch.teamBName}</div>
            <div className="text-[12px]" style={{ color: 'var(--text-2)' }}>Open match centre →</div>
          </a>
        )}

        <div className="glass overflow-hidden">
          <div className="px-4 py-3 font-semibold">Points table</div>
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ color: 'var(--text-2)' }}>
                <th className="text-left px-3 py-2">#</th>
                <th className="text-left px-2 py-2">Team</th>
                <th className="text-right px-2 py-2">P</th>
                <th className="text-right px-2 py-2">W</th>
                <th className="text-right px-2 py-2">Pts</th>
                <th className="text-right px-3 py-2">NRR</th>
              </tr>
            </thead>
            <tbody>
              {(data?.table || []).map((r: any) => (
                <tr key={r.teamName} style={{ borderTop: '1px solid var(--separator)' }}>
                  <td className="px-3 py-2">{r.rank}</td>
                  <td className="px-2 py-2 font-medium">{r.teamName}</td>
                  <td className="text-right px-2 tabular-nums">{r.played}</td>
                  <td className="text-right px-2 tabular-nums">{r.won}</td>
                  <td className="text-right px-2 tabular-nums font-semibold">{r.points}</td>
                  <td className="text-right px-3 tabular-nums">{r.nrr > 0 ? '+' : ''}{r.nrr}</td>
                </tr>
              ))}
              {(data?.table || []).length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center" style={{ color: 'var(--text-2)' }}>Standings appear after completed matches</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="glass p-4">
          <div className="font-semibold mb-2">Fixtures</div>
          <div className="space-y-1.5">
            {(data?.fixtures || []).map((f: any) => (
              <div key={f.id} className="text-[13px] flex justify-between gap-2 px-2 py-2 rounded-xl" style={{ background: 'var(--fill)' }}>
                <span>{f.teamAName || 'TBD'} vs {f.teamBName || 'TBD'}{f.venueName ? ` · ${f.venueName}` : ''}</span>
                <span className="shrink-0" style={{ color: 'var(--text-2)' }}>
                  {f.scheduledAt ? new Date(f.scheduledAt).toLocaleString() : 'TBD'}
                </span>
              </div>
            ))}
            {(data?.fixtures || []).length === 0 && (
              <div className="text-[13px] text-center py-4" style={{ color: 'var(--text-2)' }}>Fixtures will appear here</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
