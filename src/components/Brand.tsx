import { useStore } from '../store';

/** Brand mark, friendly assistant avatar and the hero scene. All inline SVG so the demo works offline. */

export function Plane({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M3 17.5 27 5c1.2-.6 2.2.6 1.5 1.7L15 27.5c-.5.8-1.7.6-1.9-.3l-1.6-6.3-6.8-2c-.9-.3-1-1.1-.2-1.4Z" fill="var(--accent)" />
      <path d="m11.5 20.9 15-14.6-11.6 15" fill="var(--coral)" opacity=".85" />
    </svg>
  );
}

export function Wordmark({ size = 26, sub = false }: { size?: number; sub?: boolean }) {
  return (
    <span className="wordmark">
      <Plane size={size + 6} />
      <span>
        <b style={{ fontSize: size }}>plan better.</b>
        {sub && <small>AI TRAVEL CONCIERGE</small>}
      </span>
    </span>
  );
}

export function Avatar({ size = 44, glow = false }: { size?: number; glow?: boolean }) {
  return (
    <svg className={glow ? 'avatar-svg glow' : 'avatar-svg'} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Your travel assistant">
      <defs>
        <radialGradient id="avbg" cx="50%" cy="40%" r="65%">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset="1" stopColor="#ffd467" />
        </radialGradient>
        <clipPath id="avclip">
          <circle cx="50" cy="50" r="48" />
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#avbg)" />
      <g clipPath="url(#avclip)">
        <path d="M18 100c0-18 14-26 32-26s32 8 32 26Z" fill="#f6c945" />
        <path d="M40 76h20v10c0 5-4 8-10 8s-10-3-10-8Z" fill="#e9a77c" />
        <path d="M24 52c0-20 10-33 26-33s26 13 26 33v22H24Z" fill="#6b3a2a" />
        <ellipse cx="50" cy="50" rx="19" ry="22" fill="#f3b88c" />
        <path d="M30 46c3-14 11-20 22-20 9 0 16 5 18 13-8-2-14-6-18-11-2 8-12 15-22 18Z" fill="#6b3a2a" />
        <ellipse cx="42" cy="50" rx="2.6" ry="3.4" fill="#2a1a18" />
        <ellipse cx="58" cy="50" rx="2.6" ry="3.4" fill="#2a1a18" />
        <circle cx="43" cy="48.8" r=".9" fill="#fff" />
        <circle cx="59" cy="48.8" r=".9" fill="#fff" />
        <path d="M43 61c3 4 11 4 14 0" stroke="#b54a4a" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <ellipse cx="36" cy="58" rx="4" ry="2.4" fill="#f08a8a" opacity=".45" />
        <ellipse cx="64" cy="58" rx="4" ry="2.4" fill="#f08a8a" opacity=".45" />
      </g>
    </svg>
  );
}

/** Pink city silhouette under a warm sky, standing in for the hero photo. */
export function HeroScene({ title }: { title?: string }) {
  return (
    <svg className="hero-scene" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label={title ?? 'Illustration of a palace at sunset'}>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd9a8" />
          <stop offset=".55" stopColor="#ffb7a0" />
          <stop offset="1" stopColor="#f58aa5" />
        </linearGradient>
        <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e88a78" />
          <stop offset="1" stopColor="#c8566a" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#sky)" />
      <circle cx="290" cy="90" r="44" fill="#fff2c2" opacity=".9" />
      <path d="M0 210c60-30 110-10 170-25s120-35 230-5v120H0Z" fill="#e9a07a" opacity=".6" />
      <g fill="url(#wall)">
        <rect x="90" y="150" width="230" height="150" />
        <rect x="140" y="110" width="130" height="50" />
        <path d="M150 110c0-30 12-44 55-44s55 14 55 44Z" />
        <rect x="198" y="40" width="14" height="30" />
        <path d="M205 22c9 8 9 18 0 18s-9-10 0-18Z" />
        <rect x="60" y="120" width="34" height="180" />
        <path d="M60 120c0-22 8-30 17-30s17 8 17 30Z" />
        <rect x="316" y="130" width="34" height="170" />
        <path d="M316 130c0-22 8-30 17-30s17 8 17 30Z" />
      </g>
      <g fill="#ffe3b8" opacity=".9">
        {[0, 1, 2, 3, 4].map((i) => (
          <path key={i} d={`M${112 + i * 40} 270v-34c0-13 18-13 18 0v34Z`} />
        ))}
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M${166 + i * 36} 158v-22c0-10 14-10 14 0v22Z`} />
        ))}
      </g>
      <path d="M0 262c80-10 130 10 200 4s150-16 200 0v40H0Z" fill="#3f5b48" />
      <g fill="#f08fa6">
        {[30, 70, 330, 370, 150, 250].map((x, i) => (
          <circle key={x} cx={x} cy={270 + (i % 3) * 8} r="7" />
        ))}
      </g>
    </svg>
  );
}

export function Waveform({ active = true, bars = 36 }: { active?: boolean; bars?: number }) {
  return (
    <div className={`wave ${active ? 'on' : ''}`} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <i key={i} style={{ animationDelay: `${(i % 9) * 0.09}s`, height: `${20 + Math.abs(Math.sin(i * 1.7)) * 70}%` }} />
      ))}
    </div>
  );
}

export const TONES = {
  sun: ['#f6c945', '#e0527a'],
  rose: ['#f58aa5', '#b3294f'],
  sage: ['#7fb69a', '#25352e'],
  coral: ['#f29a82', '#e97661'],
  sky: ['#8ec5e8', '#2b6aa3'],
} as const;

/** The traveller's own avatar: their initial on a tone chosen in the profile. */
export function UserAvatar({ size = 36 }: { size?: number }) {
  const me = useStore((s) => s.settings.me);
  const [a, b] = TONES[me.avatarTone] ?? TONES.sun;
  const initial = (me.name.trim()[0] ?? '').toUpperCase();
  return (
    <span className="user-avatar" style={{ width: size, height: size, fontSize: size * 0.44, background: `linear-gradient(135deg, ${a}, ${b})` }} aria-label={me.name ? `${me.name}'s avatar` : 'Your avatar'}>
      {initial || (
        <svg width={size * 0.52} height={size * 0.52} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
        </svg>
      )}
    </span>
  );
}
