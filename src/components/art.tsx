import { useEffect, useId, useRef, useState } from 'react';

const INK = '#0c1f12';

/** Player ball colours, in the same order as PLAYER_COLORS in ui.tsx. */
export const BALL_FILL = ['#ff5a4e', '#4d8dff', '#b07cff', '#ff9b38'];

/**
 * A football. White for a solo round; in the player's colour when several people share a hole.
 * Drawn as a classic panel ball: a centre pentagon, five spokes and five rim panels.
 */
export function Ball({ size = 24, fill = '#fff', className }: { size?: number; fill?: string; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <clipPath id={`b${id}`}>
          <circle cx="16" cy="16" r="14.6" />
        </clipPath>
      </defs>
      <circle cx="16" cy="16" r="14.6" fill={fill} />
      <g clipPath={`url(#b${id})`} fill={INK}>
        <path d="M16 10.5 21.23 14.3 19.23 20.45H12.77L10.77 14.3Z" />
        <circle cx="16" cy="-0.5" r="5.6" />
        <circle cx="31.69" cy="10.9" r="5.6" />
        <circle cx="25.7" cy="29.35" r="5.6" />
        <circle cx="6.3" cy="29.35" r="5.6" />
        <circle cx="0.31" cy="10.9" r="5.6" />
      </g>
      <path
        d="M16 10.5V4M21.23 14.3l6.18-2M19.23 20.45l3.82 5.26M12.77 20.45l-3.82 5.26M10.77 14.3l-6.18-2"
        stroke={INK}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="14.6" fill="none" stroke={INK} strokeWidth="2.2" />
      <ellipse cx="10.5" cy="8.6" rx="4" ry="2.2" transform="rotate(-30 10.5 8.6)" fill="#fff" opacity="0.4" />
    </svg>
  );
}

/** The pin: pole and a pennant that flutters (see .pin-flag in styles.css). */
export function PinFlag({ height = 40 }: { height?: number }) {
  return (
    <svg className="pin-svg" width={height * 0.72} height={height} viewBox="0 0 29 40" aria-hidden="true">
      <path d="M3 39V2" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <path className="pin-pennant" d="M4.2 2.6 27 9.2 4.2 16Z" fill="#ffd23f" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Home and invite artwork: a football arcing onto a floodlit green.
 * The ball rides the dashed arc (offset-path) unless motion is reduced.
 */
export function HeroArt({ className }: { className?: string }) {
  const arc = 'M38 150 C 90 30, 210 6, 262 108';
  return (
    <svg className={`hero-art ${className ?? ''}`} viewBox="0 0 360 180" role="img" aria-label="A football flying onto a golf green">
      <defs>
        <radialGradient id="hero-glow" cx="50%" cy="0%" r="70%">
          <stop offset="0" stopColor="#fff6c4" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff6c4" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hero-green" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#8fdc77" />
          <stop offset="1" stopColor="#5fb653" />
        </linearGradient>
      </defs>
      {/* floodlights */}
      <g className="hero-lights">
        <path d="M22 175V28" stroke="#0a2a14" strokeWidth="4" />
        <rect x="6" y="14" width="34" height="16" rx="3" fill="#0a2a14" />
        <g fill="#fff8d6">
          <circle cx="13" cy="20" r="2.6" />
          <circle cx="20" cy="20" r="2.6" />
          <circle cx="27" cy="20" r="2.6" />
          <circle cx="34" cy="20" r="2.6" />
          <circle cx="13" cy="25.5" r="2.6" />
          <circle cx="20" cy="25.5" r="2.6" />
          <circle cx="27" cy="25.5" r="2.6" />
          <circle cx="34" cy="25.5" r="2.6" />
        </g>
        <ellipse cx="23" cy="26" rx="60" ry="40" fill="url(#hero-glow)" />
        <path d="M338 175V36" stroke="#0a2a14" strokeWidth="4" />
        <rect x="322" y="22" width="34" height="16" rx="3" fill="#0a2a14" />
        <g fill="#fff8d6">
          <circle cx="329" cy="28" r="2.6" />
          <circle cx="336" cy="28" r="2.6" />
          <circle cx="343" cy="28" r="2.6" />
          <circle cx="350" cy="28" r="2.6" />
          <circle cx="329" cy="33.5" r="2.6" />
          <circle cx="336" cy="33.5" r="2.6" />
          <circle cx="343" cy="33.5" r="2.6" />
          <circle cx="350" cy="33.5" r="2.6" />
        </g>
        <ellipse cx="338" cy="34" rx="60" ry="40" fill="url(#hero-glow)" />
      </g>
      {/* rolling ground */}
      <path d="M0 150 C 70 128, 130 140, 190 132 S 300 118, 360 136 V180 H0Z" fill="#12461f" />
      <path d="M0 166 C 90 150, 170 160, 240 152 S 330 150, 360 158 V180 H0Z" fill="#0e3a1a" />
      {/* the green, the cup, the flag */}
      <ellipse cx="268" cy="124" rx="62" ry="15" fill="url(#hero-green)" stroke="#0c1f12" strokeWidth="2.5" />
      <ellipse cx="268" cy="122" rx="42" ry="8" fill="none" stroke="#fff" strokeOpacity="0.25" strokeWidth="1.5" />
      <ellipse cx="276" cy="124" rx="6" ry="2.4" fill="#0c1f12" />
      <path d="M276 124V58" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <path className="pin-pennant" d="M277.5 59 306 68 277.5 77Z" fill="#ffd23f" stroke="#0c1f12" strokeWidth="2" strokeLinejoin="round" />
      {/* the shot */}
      <path d={arc} fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="2.5" strokeDasharray="2 9" strokeLinecap="round" />
      <ellipse cx="38" cy="156" rx="11" ry="3" fill="#000" opacity="0.25" />
      <g className="hero-ball" style={{ offsetPath: `path('${arc}')` }}>
        <g transform="translate(-13 -13)">
          <Ball size={26} />
        </g>
      </g>
    </svg>
  );
}

/**
 * Play's kick: flags the shot so <ShotArt kicking> flies the ball to the cup, then runs `then` as it
 * drops in. Straight through when motion is reduced.
 */
export function useKick(): [boolean, (then: () => void) => void] {
  const [kicking, setKicking] = useState(false);
  const timer = useRef<number>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const kick = (then: () => void) => {
    if (kicking) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return then();
    setKicking(true);
    timer.current = window.setTimeout(then, 560);
  };
  return [kicking, kick];
}

/**
 * Home's one bit of scenery, and it's the game: your ball on the tee, the flag on the green, the
 * line of the shot between them. Tap Play and the ball flies the line into the cup (.is-kicking).
 */
export function ShotArt({ kicking, className }: { kicking?: boolean; className?: string }) {
  const arc = 'M62 100 C 112 8, 214 4, 262 106';
  return (
    <svg className={`shot-art${kicking ? ' is-kicking' : ''}${className ? ` ${className}` : ''}`} viewBox="0 0 320 136" aria-hidden="true">
      <defs>
        <linearGradient id="shot-green" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#8fdc77" />
          <stop offset="1" stopColor="#5fb653" />
        </linearGradient>
      </defs>
      {/* A little island of turf: shadow, sides, top. */}
      <ellipse cx="160" cy="129" rx="150" ry="5" fill="#000" opacity="0.2" />
      <path d="M10 124 C 34 110, 80 110, 120 112 S 210 102, 252 101 S 306 106, 310 124 C 250 131, 70 131, 10 124Z" fill="#0d3a19" />
      <path d="M14 121 C 38 108, 80 108, 120 110 S 210 100, 252 99 S 302 104, 306 121 C 250 125, 70 125, 14 121Z" fill="#1a5a2b" />
      <rect x="44" y="114" width="36" height="9" rx="3" fill="#5fb653" stroke={INK} strokeWidth="2.2" />
      <ellipse cx="254" cy="110" rx="50" ry="12" fill="url(#shot-green)" stroke={INK} strokeWidth="2.5" />
      <ellipse cx="262" cy="110" rx="6" ry="2.4" fill={INK} />
      <path d="M262 110V44" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <path className="pin-pennant" d="M263.5 45 292 54 263.5 63Z" fill="#ffd23f" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path className="shot-line" d={arc} fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="2.5" strokeDasharray="2 9" strokeLinecap="round" />
      <g className="shot-ball" style={{ offsetPath: `path('${arc}')` }}>
        <g className="shot-ball-in">
          <g transform="translate(-14 -14)">
            <Ball size={28} />
          </g>
        </g>
      </g>
    </svg>
  );
}

/** A little trophy for the winner banner. */
export function Trophy({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" aria-hidden="true" className="trophy">
      <path d="M17 8h22v10c0 8-5 14-11 14s-11-6-11-14Z" fill="#ffd23f" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M17 12H9c0 8 4 12 9 12M39 12h8c0 8-4 12-9 12" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <path d="M24 32h8v8h-8Z" fill="#ffd23f" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <rect x="16" y="40" width="24" height="8" rx="2" fill={INK} />
      <path d="M22 13v8" stroke="#fff" strokeOpacity="0.7" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
