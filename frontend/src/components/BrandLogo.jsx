import { useId } from 'react';

// Leadrat brand mark + wordmark. Placeholder artwork - to use the official
// logo, replace the <svg> below with <img src="/logo.svg" alt="" /> (file in
// public/) and keep the wrapper so every place that shows the logo updates.
export default function BrandLogo({ size = 40, showName = true, sub, className = '' }) {
  const gradient = useId();
  return (
    <span className={`brand-logo ${className}`}>
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#5b6cff" />
            <stop offset="0.55" stopColor="#4a2fe0" />
            <stop offset="1" stopColor="#0fa08e" />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="12" fill={`url(#${gradient})`} />
        <path d="M15 12v24h18" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="33" cy="15" r="4" fill="#ffd166" />
        <path d="M22 27l5-5 4 3" fill="none" stroke="#ffd166" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {showName && (
        <span className="brand-logo-text">
          <span className="brand-logo-name">Leadrat</span>
          {sub && <span className="brand-logo-sub">{sub}</span>}
        </span>
      )}
    </span>
  );
}
