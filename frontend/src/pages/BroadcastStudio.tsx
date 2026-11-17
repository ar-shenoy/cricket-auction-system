import React, { useEffect, useState, useRef } from 'react';
import AppShell from '../components/AppShell';
import api, { getSocketUrl } from '../services/api';

const SPONSOR_SLOTS = [
  { id: 'top', label: 'Top bar' },
  { id: 'bottom', label: 'Bottom bar' },
  { id: 'left', label: 'Left rail' },
  { id: 'right', label: 'Right rail' },
  { id: 'corner', label: 'Corner badge' },
] as const;

type SponsorItem = { url: string; position: string };

export default function BroadcastStudio() {
  const [brand, setBrand] = useState<any>({
    primaryColor: '#0a84ff',
    secondaryColor: '#1c1c1e',
    accentColor: '#30d158',
    logoUrl: '',
    sponsorLogos: [] as string[],
    sponsorPlacements: [] as SponsorItem[],
    showSponsors: true,
    lowerThirdTitle: '',
    lowerThirdSubtitle: 'Live'
  });
  const [sponsorInput, setSponsorInput] = useState('');
  const [sponsorPos, setSponsorPos] = useState('bottom');
  const [preview, setPreview] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [uploading, setUploading] = useState(false);
  const dirtyRef = useRef(false);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const sponsorFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get('/broadcast/settings')
      .then(r => {
        if (!dirtyRef.current) setBrand((b: any) => ({ ...b, ...r.data }));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const fetchPreview = () => {
      fetch(`${getSocketUrl()}/api/broadcast/public/lower-thirds`)
        .then(r => r.json())
        .then(setPreview)
        .catch(() => {});
    };
    fetchPreview();
    const id = setInterval(fetchPreview, 10000);
    return () => clearInterval(id);
  }, []);

  const setField = (patch: Record<string, any>) => {
    dirtyRef.current = true;
    setBrand((b: any) => ({ ...b, ...patch }));
  };

  const uploadImage = async (file: File): Promise<string> => {
    if (file.size > 1.5 * 1024 * 1024) {
      throw new Error('File too large (max 1.5 MB). Compress or use a smaller PNG/JPEG.');
    }
    const fd = new FormData();
    fd.append('file', file);
    const res = await api.post('/upload/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    return res.data?.url || res.data?.path || '';
  };

  const onLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      if (url) setField({ logoUrl: url });
      setMsg(file.size <= 400 * 1024 ? 'Logo uploaded (persists across restarts)' : 'Logo uploaded (disk — prefer ≤400 KB for free-tier)');
    } catch (err: any) {
      setMsg(err.response?.data?.error || err.message || 'Logo upload failed');
    } finally {
      setUploading(false);
      if (logoFileRef.current) logoFileRef.current.value = '';
    }
  };

  const onSponsorFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      if (url) {
        dirtyRef.current = true;
        setBrand((b: any) => {
          const logos = [...(b.sponsorLogos || []), url];
          const placements: SponsorItem[] = [...(b.sponsorPlacements || []), { url, position: sponsorPos }];
          return { ...b, sponsorLogos: logos, sponsorPlacements: placements };
        });
        setMsg('Sponsor image added');
      }
    } catch (err: any) {
      setMsg(err.response?.data?.error || err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (sponsorFileRef.current) sponsorFileRef.current.value = '';
    }
  };

  const save = async () => {
    try {
      const r = await api.put('/broadcast/settings', brand);
      setBrand((b: any) => ({ ...b, ...r.data }));
      dirtyRef.current = false;
      setMsg('Broadcast pack saved — used on /scoreboard and lower-thirds API');
    } catch (e: any) {
      setMsg(e.response?.data?.error || 'Save failed');
    }
  };

  const addSponsorUrl = () => {
    if (!sponsorInput.trim()) return;
    const url = sponsorInput.trim();
    dirtyRef.current = true;
    setBrand((b: any) => ({
      ...b,
      sponsorLogos: [...(b.sponsorLogos || []), url],
      sponsorPlacements: [...(b.sponsorPlacements || []), { url, position: sponsorPos }]
    }));
    setSponsorInput('');
  };

  const removeSponsor = (idx: number) => {
    dirtyRef.current = true;
    setBrand((b: any) => {
      const logos = [...(b.sponsorLogos || [])];
      const placements = [...(b.sponsorPlacements || [])];
      logos.splice(idx, 1);
      if (placements[idx]) placements.splice(idx, 1);
      return { ...b, sponsorLogos: logos, sponsorPlacements: placements };
    });
  };

  const setSponsorPosition = (idx: number, position: string) => {
    dirtyRef.current = true;
    setBrand((b: any) => {
      const placements: SponsorItem[] = [...(b.sponsorPlacements || [])];
      const logos: string[] = b.sponsorLogos || [];
      while (placements.length < logos.length) {
        placements.push({ url: logos[placements.length], position: 'bottom' });
      }
      if (placements[idx]) placements[idx] = { ...placements[idx], position };
      else if (logos[idx]) placements[idx] = { url: logos[idx], position };
      return { ...b, sponsorPlacements: placements };
    });
  };

  const apiUrl = `${getSocketUrl()}/api/broadcast/public/lower-thirds`;
  const scoreboardUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/scoreboard`;

  return (
    <AppShell title="Broadcast Pack" subtitle="ICC-style branding · sponsors · lower-thirds · scoreboard overlay">
      {msg && (
        <div className="glass p-3 mb-4 text-[13px]" style={{ color: 'var(--accent)' }}>
          {msg}
          <button type="button" className="ml-3 underline text-[12px]" onClick={() => setMsg('')}>Dismiss</button>
        </div>
      )}

      <div className="glass p-3 mb-4 text-[13px] space-y-1" style={{ color: 'var(--text-2)' }}>
        <div>This pack drives <strong style={{ color: 'var(--text)' }}>/scoreboard</strong> and the lower-thirds API for OBS / vMix.</div>
        <div><strong style={{ color: 'var(--text)' }}>Image limits:</strong> PNG / JPEG / WebP / GIF · max <strong style={{ color: 'var(--text)' }}>1.5 MB</strong> · prefer <strong style={{ color: 'var(--text)' }}>≤400 KB</strong> (survives free-tier restarts).</div>
        <div><strong style={{ color: 'var(--text)' }}>Recommended sizes:</strong> league logo 256×256 or 400×120 · top/bottom sponsors ~200×60 · side rails ~120×120 · corner ~128×128.</div>
        <div>Open scoreboard: <a href={scoreboardUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{scoreboardUrl}</a></div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="glass p-4 space-y-3">
          <div className="font-semibold">Brand kit</div>
          <div className="grid grid-cols-3 gap-2">
            {(['primaryColor', 'secondaryColor', 'accentColor'] as const).map(k => (
              <div key={k}>
                <label className="as-label">{k.replace('Color', '')}</label>
                <input type="color" className="as-input h-10 p-1" value={brand[k] || '#000000'} onChange={e => setField({ [k]: e.target.value })} />
              </div>
            ))}
          </div>

          <div>
            <label className="as-label">Logo URL or upload</label>
            <p className="text-[11px] mb-1" style={{ color: 'var(--text-2)' }}>Max 1.5 MB · best ≤400 KB · ~256×256 or 400×120</p>
            <div className="flex gap-2 items-center">
              <input className="as-input flex-1" value={brand.logoUrl || ''} onChange={e => setField({ logoUrl: e.target.value })} placeholder="https://… or upload" />
              <button type="button" className="as-btn-ghost text-sm shrink-0" disabled={uploading} onClick={() => logoFileRef.current?.click()}>Upload</button>
              <input ref={logoFileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={onLogoFile} />
            </div>
            {brand.logoUrl && <img src={brand.logoUrl} alt="" className="mt-2 h-12 object-contain rounded-lg" />}
          </div>

          <div>
            <label className="as-label">Lower-third title</label>
            <input className="as-input" value={brand.lowerThirdTitle || ''} onChange={e => setField({ lowerThirdTitle: e.target.value })} placeholder="League / series name" />
          </div>
          <div>
            <label className="as-label">Lower-third subtitle</label>
            <input className="as-input" value={brand.lowerThirdSubtitle || ''} onChange={e => setField({ lowerThirdSubtitle: e.target.value })} placeholder="Live · Match 12" />
          </div>

          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={brand.showSponsors !== false} onChange={e => setField({ showSponsors: e.target.checked })} />
            Show sponsors on scoreboard
          </label>

          <button type="button" className="as-btn-primary w-full" onClick={save} disabled={uploading}>Save broadcast pack</button>
        </div>

        <div className="glass p-4 space-y-3">
          <div className="font-semibold">Sponsor strip (multi-position)</div>
          <p className="text-[12px]" style={{ color: 'var(--text-2)' }}>
            Positions: top bar, bottom ticker, side rails, corner badge.
            File: max 1.5 MB · prefer ≤400 KB · bars ~200×60 · rails ~120×120 · corner ~128×128.
          </p>

          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[140px]">
              <label className="as-label">Sponsor image URL</label>
              <input className="as-input" value={sponsorInput} onChange={e => setSponsorInput(e.target.value)} placeholder="https://…" />
            </div>
            <div>
              <label className="as-label">Position</label>
              <select className="as-input" value={sponsorPos} onChange={e => setSponsorPos(e.target.value)}>
                {SPONSOR_SLOTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <button type="button" className="as-btn-ghost text-sm" onClick={addSponsorUrl}>Add URL</button>
            <button type="button" className="as-btn-ghost text-sm" disabled={uploading} onClick={() => sponsorFileRef.current?.click()}>Upload logo</button>
            <input ref={sponsorFileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={onSponsorFile} />
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {(brand.sponsorLogos || []).map((url: string, i: number) => {
              const pos = brand.sponsorPlacements?.[i]?.position || 'bottom';
              return (
                <div key={i} className="flex items-center gap-2 p-2 rounded-xl" style={{ background: 'var(--fill)' }}>
                  <img src={url} alt="" className="h-8 w-16 object-contain rounded bg-black/20" onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3'; }} />
                  <select className="as-input text-sm flex-1" value={pos} onChange={e => setSponsorPosition(i, e.target.value)}>
                    {SPONSOR_SLOTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                  <button type="button" className="text-[12px]" style={{ color: '#ff3b30' }} onClick={() => removeSponsor(i)}>Remove</button>
                </div>
              );
            })}
            {(brand.sponsorLogos || []).length === 0 && (
              <div className="text-[13px] py-4 text-center" style={{ color: 'var(--text-2)' }}>No sponsors yet</div>
            )}
          </div>

          <div className="text-[12px] pt-2" style={{ color: 'var(--text-2)' }}>
            Lower-thirds API: <code className="text-[11px] break-all">{apiUrl}</code>
          </div>

          {preview?.match && (
            <div className="text-[13px] p-3 rounded-xl" style={{ background: 'var(--fill)' }}>
              <div className="font-medium">Live preview feed</div>
              <div>{preview.match.teamAName} vs {preview.match.teamBName}</div>
              <div className="tabular-nums">{preview.match.score} ({preview.match.overs})</div>
            </div>
          )}
        </div>
      </div>

      <div className="glass p-4 mt-4">
        <div className="font-semibold mb-2">Scoreboard layout preview</div>
        <p className="text-[12px] mb-3" style={{ color: 'var(--text-2)' }}>
          Approximate ICC-style overlay. Top/bottom bars, side rails and corner use your sponsor placements. Colours and logo update live as you edit (save to push to /scoreboard).
        </p>
        <div
          className="relative rounded-2xl overflow-hidden border border-white/10"
          style={{
            background: `linear-gradient(160deg, ${brand.secondaryColor || '#1c1c1e'}, #0a0a0c 60%)`,
            minHeight: 280
          }}
        >
          <div className="flex items-center justify-center gap-4 px-4 py-2 border-b border-white/10" style={{ background: 'rgba(0,0,0,0.35)' }}>
            {(brand.sponsorPlacements || []).filter((p: any) => (p.position || '') === 'top').map((p: any, i: number) => (
              <img key={i} src={p.url} alt="" className="h-7 object-contain opacity-90" />
            ))}
            {!(brand.sponsorPlacements || []).some((p: any) => p.position === 'top') && (
              <span className="text-[11px] text-white/30">Top bar sponsors</span>
            )}
          </div>
          <div className="flex" style={{ minHeight: 200 }}>
            <div className="w-14 flex flex-col items-center justify-center gap-2 py-3 border-r border-white/10" style={{ background: 'rgba(0,0,0,0.25)' }}>
              {(brand.sponsorPlacements || []).filter((p: any) => p.position === 'left').map((p: any, i: number) => (
                <img key={i} src={p.url} alt="" className="w-10 h-10 object-contain" />
              ))}
              {!(brand.sponsorPlacements || []).some((p: any) => p.position === 'left') && (
                <span className="text-[10px] text-white/25" style={{ writingMode: 'vertical-rl' }}>Left</span>
              )}
            </div>
            <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 relative">
              {brand.logoUrl ? <img src={brand.logoUrl} alt="" className="h-10 object-contain mb-3 opacity-90" /> : null}
              <div className="text-[11px] uppercase tracking-widest" style={{ color: brand.primaryColor || '#0a84ff' }}>
                {brand.lowerThirdTitle || 'League name'}
              </div>
              <div className="text-3xl font-black tabular-nums text-white mt-1">142/3</div>
              <div className="text-sm text-white/50 tabular-nums">15.2 ov · CRR 9.32</div>
              <div className="text-[12px] mt-2" style={{ color: brand.accentColor || '#30d158' }}>
                {brand.lowerThirdSubtitle || 'Live'}
              </div>
              <div className="absolute bottom-3 right-3 flex gap-1">
                {(brand.sponsorPlacements || []).filter((p: any) => p.position === 'corner').map((p: any, i: number) => (
                  <img key={i} src={p.url} alt="" className="h-8 w-8 object-contain rounded bg-black/40" />
                ))}
              </div>
            </div>
            <div className="w-14 flex flex-col items-center justify-center gap-2 py-3 border-l border-white/10" style={{ background: 'rgba(0,0,0,0.25)' }}>
              {(brand.sponsorPlacements || []).filter((p: any) => p.position === 'right').map((p: any, i: number) => (
                <img key={i} src={p.url} alt="" className="w-10 h-10 object-contain" />
              ))}
              {!(brand.sponsorPlacements || []).some((p: any) => p.position === 'right') && (
                <span className="text-[10px] text-white/25" style={{ writingMode: 'vertical-rl' }}>Right</span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-center gap-4 px-4 py-2 border-t border-white/10" style={{ background: 'rgba(0,0,0,0.35)' }}>
            {(brand.sponsorPlacements || []).filter((p: any) => (p.position || 'bottom') === 'bottom').map((p: any, i: number) => (
              <img key={i} src={p.url} alt="" className="h-7 object-contain opacity-90" />
            ))}
            {!(brand.sponsorPlacements || []).some((p: any) => (p.position || 'bottom') === 'bottom') && (
              <span className="text-[11px] text-white/30">Bottom bar sponsors</span>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
