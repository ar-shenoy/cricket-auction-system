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
  jerseyNumber?: number | string;
};

type Props = {
  player: PlayerCardPlayer;
  bid?: number | null;
  leadingTeam?: string | null;
  status?: 'bidding' | 'sold' | 'unsold' | 'idle';
  soldPrice?: number | null;
  soldTeam?: string | null;
  teamName?: string | null;
  compact?: boolean;
  className?: string;
};

function themeForRole(role?: string) {
  const r = (role || '').toLowerCase();
  if (r.includes('bat') && !r.includes('all')) {
    return { a: '#00e5ff', b: '#0066ff', c: '#001a33', label: 'BATTER' };
  }
  if (r.includes('bowl')) {
    return { a: '#ff2d6a', b: '#9b1d4a', c: '#1a0010', label: 'BOWLER' };
  }
  if (r.includes('keep') || r.includes('wk')) {
    return { a: '#c084fc', b: '#6d28d9', c: '#12002a', label: 'WICKET-KEEPER' };
  }
  if (r.includes('all')) {
    return { a: '#fbbf24', b: '#d97706', c: '#1a1000', label: 'ALL-ROUNDER' };
  }
  return { a: '#94a3b8', b: '#334155', c: '#0b1220', label: 'PLAYER' };
}

function starsForPlayer(player: PlayerCardPlayer) {
  const tags = (player.tags || []).map(t => String(t).toLowerCase());
  if (tags.some(t => t.includes('icon') || t.includes('legend'))) return 5;
  if (tags.some(t => t.includes('capped') || t.includes('star'))) return 4;
  if (player.previousPrice && player.previousPrice > 0) return 4;
  if ((player.basePrice || 0) >= 50) return 3;
  return 3;
}

export default function PlayerCard({
  player,
  bid,
  leadingTeam,
  status = 'bidding',
  soldPrice,
  soldTeam,
  teamName,
  compact = false,
  className = ''
}: Props) {
  const theme = themeForRole(player.role);
  const stars = starsForPlayer(player);
  const jersey = player.jerseyNumber ?? (player.name ? player.name.charCodeAt(0) % 99 : 12);
  const showBid = status === 'bidding' && bid != null;
  const showSold = status === 'sold';
  const showUnsold = status === 'unsold';
  const bannerTeam = soldTeam || leadingTeam || teamName || player.city || 'AUCTION';

  return (
    <div
      className={`scard ${compact ? 'scard--compact' : ''} ${status === 'sold' ? 'scard--sold' : ''} ${status === 'unsold' ? 'scard--unsold' : ''} ${className}`}
      style={{
        ['--sc-a' as any]: theme.a,
        ['--sc-b' as any]: theme.b,
        ['--sc-c' as any]: theme.c
      }}
    >
      <div className="scard__frame">
        <div className="scard__chrome" />
        <div className="scard__body">
          {/* Top banner */}
          <div className="scard__banner">
            <span className="scard__banner-text">{bannerTeam}</span>
            <span className="scard__jersey">{jersey}</span>
          </div>

          {/* Photo */}
          <div className="scard__photo-stage">
            <div className="scard__photo-cut">
              {player.photoUrl ? (
                <img src={player.photoUrl} alt="" className="scard__photo" />
              ) : (
                <div className="scard__photo scard__photo--empty">🏏</div>
              )}
            </div>
            <div className="scard__geo scard__geo--tl" />
            <div className="scard__geo scard__geo--br" />
            <div className="scard__role-tag">{theme.label}</div>
          </div>

          {/* Stars */}
          <div className="scard__stars" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className={i < stars ? 'on' : ''}>
                ★
              </span>
            ))}
          </div>

          {/* Name plate */}
          <div className="scard__nameplate">
            <div className="scard__name">{player.name}</div>
            <div className="scard__sub">
              {player.role || 'Player'}
              {player.city ? ` · ${player.city}` : ''}
              {player.age != null ? ` · ${player.age}y` : ''}
            </div>
          </div>

          {/* Styles / tags */}
          {(player.battingStyle || player.bowlingStyle || (player.tags && player.tags.length > 0)) && (
            <div className="scard__chips">
              {player.battingStyle ? <span>{player.battingStyle}</span> : null}
              {player.bowlingStyle ? <span>{player.bowlingStyle}</span> : null}
              {(player.tags || []).slice(0, 3).map(t => (
                <span key={t}>{t}</span>
              ))}
            </div>
          )}

          {/* Price row */}
          <div className="scard__prices">
            <div className="scard__price-cell">
              <span className="scard__price-label">BASE</span>
              <span className="scard__price-val">₹{Number(player.basePrice || 0).toLocaleString('en-IN')}</span>
            </div>
            {showBid && (
              <div className="scard__price-cell scard__price-cell--bid">
                <span className="scard__price-label">BID</span>
                <span className="scard__price-val">₹{Number(bid).toLocaleString('en-IN')}</span>
                {leadingTeam ? <span className="scard__price-team">{leadingTeam}</span> : null}
              </div>
            )}
            {showSold && (
              <div className="scard__price-cell scard__price-cell--sold">
                <span className="scard__price-label">SOLD</span>
                <span className="scard__price-val">₹{Number(soldPrice || 0).toLocaleString('en-IN')}</span>
                {soldTeam ? <span className="scard__price-team">{soldTeam}</span> : null}
              </div>
            )}
            {showUnsold && (
              <div className="scard__price-cell scard__price-cell--unsold">
                <span className="scard__price-label">STATUS</span>
                <span className="scard__price-val">UNSOLD</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
