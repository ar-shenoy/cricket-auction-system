import React, { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import api from '../services/api';

export default function AuditLog() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/audit?limit=150')
      .then(r => setRows(r.data.rows || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell title="Audit log" subtitle="Sells, pauses, settings changes">
      {loading ? (
        <div className="glass p-8 text-center" style={{ color: 'var(--text-2)' }}>
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="glass p-8 text-center text-[14px]" style={{ color: 'var(--text-2)' }}>
          No audit entries yet. Sells and pauses are logged automatically.
        </div>
      ) : (
        <div className="glass overflow-hidden">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>By</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="text-[12px] whitespace-nowrap" style={{ color: 'var(--text-2)' }}>
                    {r.at ? new Date(r.at).toLocaleString() : '—'}
                  </td>
                  <td className="font-medium text-[13px]">{r.action}</td>
                  <td className="text-[13px]" style={{ color: 'var(--text-2)' }}>
                    {r.by || '—'}
                  </td>
                  <td className="text-[13px]">{r.detail || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
