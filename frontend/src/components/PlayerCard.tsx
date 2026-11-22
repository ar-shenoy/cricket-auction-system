import React from 'react';

export type PlayerCardPlayer = {
  id?: string;
  name: string;
  role?: string;
  city?: string;
  photoUrl?: string;
  basePrice?: number;
  battingStyle?: string;
  bowlingStyle?: string;
  age?: number | null;
  previousPrice?: number;
  tags?: string[];
};

type Props = {
  player: PlayerCardPlayer;
  bid?: number | null;
  leadingTeam?: string | null;
  status?: 'bidding' | 'sold' | 'unsold' | 'idle';
  soldPrice?: number | null;
  soldTeam?: string | null;
  compact?: boolean;
  className?: string;
};

function roleAccent(role?: string) {
  const r = (role || '').toLowerCase();
  if (r.includes('bat') && !r.includes('all')) return { from: '#22d3ee', to: '#0284c7', label: 'BAT' };
  if (r.includes('bowl')) return { from: '#f472b6', to: '#db2777', label: 'BWL' };
  if (r.includes('keep') || r.includes('wk')) return { from: '#a78bfa', to: '#7c3aed', label: 'WK' };
  if (r.includes('all')) return { from: '#fbbf24', to: '#d97706', label: 'AR' };
  return { from: '#94a3b8', to: '#475569', label: 'PLY' };
}

export default function PlayerCard({
  player,
  bid,
  leadingTeam,
  status = 'bidding',
  soldPrice,
  soldTeam,
  compact = false,
  className = ''
}: Props) {
  const accent = roleAccent(player.role);
  const showBid = status === 'bidding' && bid != null;
  const showSold = status === 'sold';
  const showUnsold = status === 'unsold';

  return (
    <div
      className={`pcard ${compact ? 'pcard--compact' : ''} ${className}`}
      style={{
        ['--pc-from' as any]: accent.from,
        ['--pc-to' as any]: accent.to
      }}
    >
      <div className="pcard__glow" />
      <div className="pcard__inner">
        <div className="pcard__stripe">
          <span className="pcard__role-chip">{accent.label}</span>
          {player.city ? <span className="pcard__city">{player.city}</span> : null}
        </div>

        <div className="pcard__photo-wrap">
          {player.photoUrl ? (
            <img src={player.photoUrl} alt="" className="pcard__photo" />
          ) : (
            <div className="pcard__photo pcard__photo--placeholder">🏏</div>
          )}
          <div className="pcard__photo-ring" />
        </div>

        <div className="pcard__name">{player.name}</div>
        <div className="pcard__meta">
          <span>{player.role || 'Player'}</span>
          {player.age != null ? <span>· {player.age}y</span> : null}
        </div>

        {(player.battingStyle || player.bowlingStyle) && (
          <div className="pcard__styles">
            {player.battingStyle ? <span>Bat {player.battingStyle}</span> : null}
            {player.bowlingStyle ? <span>Bowl {player.bowlingStyle}</span> : null}
          </div>
        )}

        {Array.isArray(player.tags) && player.tags.length > 0 && (
          <div className="pcard__tags">
            {player.tags.slice(0, 4).map(t => (
              <span key={t}>{t}</span>
            ))}
          </div>
        )}

        <div className="pcard__footer">
          <div className="pcard__base">
            <span className="pcard__label">Base</span>
            <span className="pcard__value">₹{Number(player.basePrice || 0).toLocaleString('en-IN')}</span>
          </div>
          {showBid && (
            <div className="pcard__bid">
              <span className="pcard__label">Current</span>
              <span className="pcard__value pcard__value--bid">₹{Number(bid).toLocaleString('en-IN')}</span>
              {leadingTeam ? <span className="pcard__lead">{leadingTeam}</span> : null}
            </div>
          )}
          {showSold && (
            <div className="pcard__bid pcard__bid--sold">
              <span className="pcard__label">SOLD</span>
              <span className="pcard__value" style={{ color: '#34d399' }}>
                ₹{Number(soldPrice || 0).toLocaleString('en-IN')}
              </span>
              {soldTeam ? <span className="pcard__lead">{soldTeam}</span> : null}
            </div>
          )}
          {showUnsold && (
            <div className="pcard__bid pcard__bid--unsold">
              <span className="pcard__label">UNSOLD</span>
              <span className="pcard__value" style={{ color: '#fbbf24' }}>Passed</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
