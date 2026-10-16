import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { publicApi } from '../services/api';

export default function MatchResult() {
  const { id } = useParams<{ id: string }>();
  const [match, setMatch] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    publicApi.get(`/matches/public/${id}`).then(r => setMatch(r.data)).catch(() => setError('Match not found'));
  }, [id]);

  if (error) return <div className="min-h-screen flex items-center justify-center text-gray-500">{error}</div>;
  if (!match) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between">
          <div>
            <div className="text-xs text-gray-500 uppercase">Match result</div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{match.name}</h1>
          </div>
          <div className="flex gap-3 text-sm items-center print:hidden">
            <button type="button" onClick={() => window.print()} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm">PDF / Print</button>
            <Link to="/points" className="text-indigo-600 hover:underline">Points</Link>
          </div>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {match.result?.summary && (
          <div className="bg-emerald-50 dark:bg-emerald-900/30 rounded-xl p-5 text-center">
            <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{match.result.summary}</div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-800 rounded-xl border p-4">
            <div className="font-bold">{match.teamAName}</div>
            <div className="text-2xl font-black">{match.innings1?.runs}/{match.innings1?.wickets}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border p-4 text-right">
            <div className="font-bold">{match.teamBName}</div>
            <div className="text-2xl font-black">{match.innings2?.runs}/{match.innings2?.wickets}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
