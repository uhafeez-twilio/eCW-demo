export function WillowMark({ className = "h-9 w-9" }: { className?: string }) {
  const strands = [
    "M 32 20 C 22 26 18 36 20 50",
    "M 32 20 C 26 28 25 38 26 54",
    "M 32 20 C 32 30 32 42 32 56",
    "M 32 20 C 38 28 39 38 38 54",
    "M 32 20 C 42 26 46 36 44 50",
  ];
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="wbmark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2e8b73" />
          <stop offset="1" stopColor="#0f3d38" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill="url(#wbmark)" />
      <path d="M 30 58 C 31 46 31 34 32 18 C 33 34 33 46 34 58 Z" fill="#0f3d38" opacity="0.7" />
      <ellipse cx="32" cy="19" rx="15" ry="5.5" fill="#8bc34a" opacity="0.5" />
      {strands.map((d) => (
        <path key={d} d={d} stroke="#c5e1a5" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      ))}
    </svg>
  );
}
