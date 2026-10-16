import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicApi } from '../services/api';

export default function PointsTable() {
  const [rows, setRows] = useState<any[]>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    publicApi.get('/matches/public/points').then(res => {
      const data = res.data;
      if (Array.isArray(data)) { setRows(data); setRecent([]); }
      else { setRows(data.table || []); setRecent(data.recent || []); }
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b dark:border-gray-700">
        <div className="max-w-3xl mx-auto px-4 py-4 flex justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Points table</h1>
          <Link to="/scoreboard" className="text-sm text-rose-600 hover:underline">Scoreboard</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        {loading && <div className="text-center text-gray-500 py-12">Loading...</div>}
        {!loading && rows.length === 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border p-10 text-center text-gray-500">No completed matches yet.</div>
        )}
        {rows.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-500 uppercase">
                  <th className="text-left px-4 py-3">#</th>
                  <th className="text-left px-2 py-3">Team</th>
                  <th className="text-center px-2 py-3">P</th>
                  <th className="text-center px-2 py-3">W</th>
                  <th className="text-center px-2 py-3">L</th>
                  <th className="text-center px-2 py-3">Pts</th>
                  <th className="text-right px-4 py-3">NRR</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.teamId || r.teamName} className="border-t dark:border-gray-700">
                    <td className="px-4 py-3 font-bold text-gray-500">{r.rank}</td>
                    <td className="px-2 py-3 font-semibold">{r.teamName}</td>
                    <td className="text-center">{r.played}</td>
                    <td className="text-center">{r.won}</td>
                    <td className="text-center">{r.lost}</td>
                    <td className="text-center font-bold text-indigo-600">{r.points}</td>
                    <td className="text-right px-4">{r.nrr > 0 ? '+' : ''}{(r.nrr || 0).toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {recent.length > 0 && (
          <div>
            <h2 className="text-lg font-bold mb-3 text-gray-900 dark:text-white">Recent results</h2>
            <div className="space-y-2">
              {recent.map((m: any) => (
                <Link key={m.id} to={`/match/${m.id}`} className="block bg-white dark:bg-gray-800 rounded-xl border p-4 hover:border-indigo-400">
                  <div className="font-semibold">{m.name}</div>
                  <div className="text-sm text-gray-500">{m.teamAName} {m.scoreA} · {m.teamBName} {m.scoreB}</div>
                  <div className="text-xs text-emerald-600 mt-1">{m.summary || 'Completed'}</div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
