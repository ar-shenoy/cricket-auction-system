import React, { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import api from '../services/api';

function inr(n: number) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

export default function Intelligence() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/analytics/intelligence')
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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
    <AppShell title="Intelligence 2.0" subtitle="Market values · role inflation · impact">
      {loading && <div className="glass p-8 text-center" style={{ color: 'var(--text-2)' }}>Crunching market…</div>}
      {data && (
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
                    <div className="h-full rounded-full" style={{
                      width: `${Math.min(100, Math.abs(r.vsMarket) * 2)}%`,
                      background: r.vsMarket > 0 ? '#ff9f0a' : '#30d158'
                    }} />
                  </div>
                </div>
              ))}
              {data.roleInflation.length === 0 && <div className="text-[13px]" style={{ color: 'var(--text-2)' }}>No sales yet</div>}
            </div>
          </div>

          <div className="glass p-4">
            <div className="flex justify-between items-center mb-3">
              <div className="font-semibold">Player market values</div>
              <button type="button" className="as-btn-ghost text-sm" onClick={exportCsv}>Export CSV</button>
            </div>
            <div className="max-h-80 overflow-y-auto space-y-1">
              {data.marketValues.map((m: any, i: number) => (
                <div key={i} className="flex justify-between gap-2 text-[13px] px-2.5 py-2 rounded-xl" style={{ background: 'var(--fill)' }}>
                  <span className="truncate">
                    <span className="font-medium">{m.playerName}</span>
                    <span style={{ color: 'var(--text-2)' }}> · {m.teamName} · {m.role}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {inr(m.soldPrice)}
                    <span className="ml-2 text-[11px]" style={{
                      color: m.marketFlag === 'overpay' ? '#ff9f0a' : m.marketFlag === 'value' ? '#30d158' : 'var(--text-2)'
                    }}>{m.marketFlag}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-3">
            <div className="glass p-4">
              <div className="font-semibold mb-2">Bat impact</div>
              {data.impact.batters.map((b: any, i: number) => (
                <div key={i} className="text-[13px] flex justify-between py-1" style={{ borderBottom: '1px solid var(--separator)' }}>
                  <span>{b.name} · {b.match}</span>
                  <span className="tabular-nums">{b.runs} ({b.balls}) SR {b.sr}</span>
                </div>
              ))}
              {data.impact.batters.length === 0 && <div className="text-[13px]" style={{ color: 'var(--text-2)' }}>—</div>}
            </div>
            <div className="glass p-4">
              <div className="font-semibold mb-2">Bowl impact</div>
              {data.impact.bowlers.map((b: any, i: number) => (
                <div key={i} className="text-[13px] flex justify-between py-1" style={{ borderBottom: '1px solid var(--separator)' }}>
                  <span>{b.name} · {b.match}</span>
                  <span className="tabular-nums">{b.wickets}/{b.runs}</span>
                </div>
              ))}
              {data.impact.bowlers.length === 0 && <div className="text-[13px]" style={{ color: 'var(--text-2)' }}>—</div>}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
