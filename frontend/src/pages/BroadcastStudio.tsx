import React, { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import api, { getSocketUrl } from '../services/api';

export default function BroadcastStudio() {
  const [brand, setBrand] = useState<any>({
    primaryColor: '#0a84ff',
    secondaryColor: '#1c1c1e',
    accentColor: '#30d158',
    logoUrl: '',
    sponsorLogos: [] as string[],
    showSponsors: true,
    lowerThirdTitle: '',
    lowerThirdSubtitle: 'Live'
  });
  const [sponsorInput, setSponsorInput] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [msg, setMsg] = useState('');

  const load = () => {
    api.get('/broadcast/settings').then(r => setBrand((b: any) => ({ ...b, ...r.data }))).catch(() => {});
    fetch(`${getSocketUrl()}/api/broadcast/public/lower-thirds`)
      .then(r => r.json())
      .then(setPreview)
      .catch(() => {});
  };

  useEffect(() => { load(); const id = setInterval(load, 8000); return () => clearInterval(id); }, []);

  const save = async () => {
    try {
      const r = await api.put('/broadcast/settings', brand);
      setBrand((b: any) => ({ ...b, ...r.data }));
      setMsg('Broadcast pack saved');
    } catch (e: any) {
      setMsg(e.response?.data?.error || 'Save failed');
    }
  };

  const addSponsor = () => {
    if (!sponsorInput.trim()) return;
    setBrand((b: any) => ({ ...b, sponsorLogos: [...(b.sponsorLogos || []), sponsorInput.trim()] }));
    setSponsorInput('');
  };

  const apiUrl = `${getSocketUrl()}/api/broadcast/public/lower-thirds`;

  return (
    <AppShell title="Broadcast Pack" subtitle="Branding · lower-thirds API · sponsors">
      {msg && <div className="glass p-3 mb-4 text-[13px]" style={{ color: 'var(--accent)' }}>{msg}</div>}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="glass p-4 space-y-3">
          <div className="font-semibold">Brand kit</div>
          <div className="grid grid-cols-3 gap-2">
            {(['primaryColor', 'secondaryColor', 'accentColor'] as const).map(k => (
              <div key={k}>
                <label className="as-label">{k.replace('Color', '')}</label>
                <input type="color" className="as-input h-10 p-1" value={brand[k] || '#000000'} onChange={e => setBrand({ ...brand, [k]: e.target.value })} />
              </div>
            ))}
          </div>
          <div>
            <label className="as-label">Logo URL</label>
            <input className="as-input" value={brand.logoUrl || ''} onChange={e => setBrand({ ...brand, logoUrl: e.target.value })} />
          </div>
          <div>
            <label className="as-label">Lower-third title</label>
            <input className="as-input" value={brand.lowerThirdTitle || ''} onChange={e => setBrand({ ...brand, lowerThirdTitle: e.target.value })} />
          </div>
          <div>
            <label className="as-label">Lower-third subtitle</label>
            <input className="as-input" value={brand.lowerThirdSubtitle || ''} onChange={e => setBrand({ ...brand, lowerThirdSubtitle: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={!!brand.showSponsors} onChange={e => setBrand({ ...brand, showSponsors: e.target.checked })} />
            Show sponsor strip
          </label>
          <div className="flex gap-2">
            <input className="as-input flex-1" placeholder="Sponsor logo URL" value={sponsorInput} onChange={e => setSponsorInput(e.target.value)} />
            <button type="button" className="as-btn-ghost text-sm" onClick={addSponsor}>Add</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(brand.sponsorLogos || []).map((u: string, i: number) => (
              <span key={i} className="glass-island text-[11px] max-w-[140px] truncate">{u}</span>
            ))}
          </div>
          <button type="button" className="as-btn-primary text-sm" onClick={save}>Save pack</button>
        </div>

        <div className="space-y-3">
          <div className="glass p-4" style={{ background: brand.secondaryColor || '#1c1c1e', color: '#fff' }}>
            <div className="text-[11px] uppercase opacity-70">Lower-third preview</div>
            <div className="text-[18px] font-semibold mt-1" style={{ color: brand.primaryColor }}>{brand.lowerThirdTitle || 'League'}</div>
            <div className="text-[13px] opacity-80">{brand.lowerThirdSubtitle || 'Live'}</div>
            {preview?.match && (
              <div className="mt-4 pt-3 border-t border-white/10">
                <div className="text-[15px] font-semibold">{preview.match.teamAName} vs {preview.match.teamBName}</div>
                <div className="text-[28px] font-bold tabular-nums mt-1">{preview.match.score}</div>
                <div className="text-[12px] opacity-70">{preview.match.overs} ov · CRR {preview.match.crr}</div>
                <div className="text-[12px] mt-1 opacity-80">
                  {preview.match.striker || '—'} * · {preview.match.bowler || '—'} bowling
                </div>
              </div>
            )}
            {!preview?.match && <div className="mt-4 text-[13px] opacity-50">No live match — API still serves brand kit</div>}
          </div>

          <div className="glass p-4 text-[12px] space-y-2">
            <div className="font-semibold text-[14px]">OBS / graphics API</div>
            <code className="block p-2 rounded-lg break-all" style={{ background: 'var(--fill)' }}>{apiUrl}</code>
            <p style={{ color: 'var(--text-2)' }}>Poll every 1–2s. JSON includes brand colours, sponsors, and live score lower-thirds fields.</p>
            <a href={apiUrl} target="_blank" rel="noreferrer" className="as-btn-ghost text-sm inline-block">Open JSON</a>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
