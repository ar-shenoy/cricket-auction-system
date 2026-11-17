import React, { useEffect, useState, useCallback, useRef } from 'react';
import AppShell from '../components/AppShell';
import api, { getSocketUrl } from '../services/api';
import { io, Socket } from 'socket.io-client';

function inr(n: number) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

export default function Intelligence() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await api.get('/analytics/intelligence');
      setData(r.data);
      setError(null);
      setUpdatedAt(new Date().toLocaleTimeString());
    } catch (e: any) {
      console.error(e);
      if (!silent) setError(e.response?.data?.error || e.message || 'Failed to load intelligence');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    const poll = setInterval(() => load(true), 8000);

    const socket = io(getSocketUrl(), { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    const refresh = () => load(true);
    socket.on('player-sold', refresh);
    socket.on('auction-status', refresh);
    socket.on('auction-ended', refresh);
    socket.on('score-update', refresh);

    return () => {
      clearInterval(poll);
      socket.disconnect();
    };
  }, [load]);

  const exportCsv = () => {
    if (!data?.marketValues) return;
    const rows = [['Player', 'Role', 'Team', 'Sold', 'RoleAvg', 'Premium%', 'Flag']];
    data.marketValues.forEach((m: any) => {
      rows.push([m.playerName, m.role, m.teamName, m.soldPrice, m.roleAvgPrice, m.premiumPct, m.marketFlag]);
    });
    const csv = rows.map((r: any[]) => r.map(c => `"${c}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'auction-intelligence.csv';
    a.click();
  };

  return (
    <AppShell title="Intelligence 2.0" subtitle="Live market values · role inflation · match impact">
      <div className="glass p-3 mb-4 text-[12px] space-y-1" style={{ color: 'var(--text-2)' }}>
        <div>
          <strong style={{ color: 'var(--text)' }}>How overpay / value works:</strong> as players sell, we compute the
          average price for each <em>role</em> (batsman, bowler, …). A player is{' '}
          <span style={{ color: '#ff9f0a' }}>overpay</span> if ≥20% above their role average,{' '}
          <span style={{ color: '#30d158' }}>value</span> if ≥15% below, otherwise <span style={{ color: 'var(--text)' }}>fair</span>.
          Flags recompute after every sale (live) — they are not fixed forever.
        </div>
        <div>
          <strong style={{ color: 'var(--text)' }}>After matches:</strong> bat/bowl impact tables fill from scoring data.
          Overpay flags stay auction-based unless you later add performance-adjusted models.
        </div>
        {updatedAt && (
          <div className="text-[11px]">
            Live · last refresh {updatedAt} · auto-updates on sell + every 8s
          </div>
        )}
      </div>

      {loading && !data && (
        <div className="glass p-8 text-center" style={{ color: 'var(--text-2)' }}>Crunching market…</div>
      )}
      {!loading && error && (
        <div className="glass p-6 text-center space-y-2">
          <div className="font-medium" style={{ color: '#ff3b30' }}>Could not load Intel</div>
          <div className="text-[13px]" style={{ color: 'var(--text-2)' }}>{error}</div>
          <button type="button" className="as-btn-ghost text-sm" onClick={() => load(false)}>Retry</button>
        </div>
      )}
      {!loading && !error && data && data.market?.soldCount === 0 && (
        <div className="glass p-8 text-center space-y-2">
          <div className="font-medium">No sold players yet</div>
          <div className="text-[13px]" style={{ color: 'var(--text-2)' }}>
            Sell a player in the auction — this page updates live without a full refresh.
          </div>
        </div>
      )}
      {data && data.market?.soldCount > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              { l: 'Sold', v: String(data.market.soldCount) },
              { l: 'Avg price', v: inr(data.market.avgPrice) },
              { l: 'Median', v: inr(data.market.medianPrice) },
              { l: 'Total spend', v: inr(data.market.totalSpend) }
            ].map(k => (
              <div key={k.l} className="glass p-3.5">
                <div className="text-[11px] uppercase" style={{ color: 'var(--text-2)' }}>{k.l}</div>
                <div className="text-[18px] font-semibold tabular-nums mt-1">{k.v}</div>
              </div>
            ))}
          </div>

          <div className="glass p-4">
            <div className="font-semibold mb-3">Role inflation</div>
            <div className="space-y-2">
              {data.roleInflation.map((r: any) => (
                <div key={r.role}>
                  <div className="flex justify-between text-[13px] mb-1">
                    <span className="font-medium">{r.role} · {r.count} sold</span>
                    <span className="tabular-nums">{inr(r.avgPrice)} · {r.vsMarket > 0 ? '+' : ''}{r.vsMarket}% vs mkt</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: 'var(--fill)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, Math.abs(r.vsMarket) * 2)}%`,
                        background: r.vsMarket > 0 ? '#ff9f0a' : '#30d158'
                      }}
                    />
                  </div>
                </div>
              ))}
              {data.roleInflation.length === 0 && (
                <div className="text-[13px]" style={{ color: 'var(--text-2)' }}>No sales yet</div>
              )}
            </div>
          </div>

          <div className="glass p-4">
            <div className="flex justify-between items-center mb-3">
              <div className="font-semibold">Player market values</div>
              <button type="button" className="as-btn-ghost text-sm" onClick={exportCsv}>Export CSV</button>
            </div>
            <div className="max-h-80 overflow-y-auto space-y-1">
              {data.marketValues.map((m: any, i: number) => (
                <div
                  key={i}
                  className="flex justify-between gap-2 text-[13px] px-2.5 py-2 rounded-xl"
                  style={{ background: 'var(--fill)' }}
                >
                  <span className="truncate">
                    <span className="font-medium">{m.playerName}</span>
                    <span style={{ color: 'var(--text-2)' }}> · {m.teamName} · {m.role}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {inr(m.soldPrice)}
                    <span
                      className="ml-2 text-[11px]"
                      style={{
                        color:
                          m.marketFlag === 'overpay'
                            ? '#ff9f0a'
                            : m.marketFlag === 'value'
                              ? '#30d158'
                              : 'var(--text-2)'
                      }}
                    >
                      {m.marketFlag}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-3">
            <div className="glass p-4">
              <div className="font-semibold mb-2">Bat impact</div>
              {data.impact.batters.map((b: any, i: number) => (
                <div
                  key={i}
                  className="text-[13px] flex justify-between py-1"
                  style={{ borderBottom: '1px solid var(--separator)' }}
                >
                  <span>
                    {b.name} · {b.match}
                  </span>
                  <span className="tabular-nums">
                    {b.runs} ({b.balls}) SR {b.sr}
                  </span>
                </div>
              ))}
              {data.impact.batters.length === 0 && (
                <div className="text-[13px]" style={{ color: 'var(--text-2)' }}>
                  — Score matches to see batting impact
                </div>
              )}
            </div>
            <div className="glass p-4">
              <div className="font-semibold mb-2">Bowl impact</div>
              {data.impact.bowlers.map((b: any, i: number) => (
                <div
                  key={i}
                  className="text-[13px] flex justify-between py-1"
                  style={{ borderBottom: '1px solid var(--separator)' }}
                >
                  <span>
                    {b.name} · {b.match}
                  </span>
                  <span className="tabular-nums">
                    {b.wickets}/{b.runs}
                  </span>
                </div>
              ))}
              {data.impact.bowlers.length === 0 && (
                <div className="text-[13px]" style={{ color: 'var(--text-2)' }}>
                  — Score matches to see bowling impact
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
