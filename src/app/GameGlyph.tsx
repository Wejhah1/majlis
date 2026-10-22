// Placeholder art for each game's picker card until the group uploads real card art.

export function GameGlyph({ id }: { id: string }) {
  switch (id) {
    case 'passnames':
      // 5×5 key grid: one black assassin square, team squares scattered.
      return (
        <svg viewBox="0 0 50 50" aria-hidden="true">
          {Array.from({ length: 25 }, (_, i) => {
            const x = (i % 5) * 10 + 1;
            const y = Math.floor(i / 5) * 10 + 1;
            const fill =
              i === 12 ? 'var(--paper-ink)' : [1, 7, 9, 18, 21].includes(i) ? 'var(--team-red)' : [3, 5, 14, 16, 23].includes(i) ? 'var(--team-blue)' : 'none';
            return <rect key={i} x={x} y={y} width="8" height="8" rx="1" fill={fill} stroke="currentColor" strokeWidth="0.8" />;
          })}
        </svg>
      );
    case 'mafia':
      // Crescent moon over a closed eye: night falls.
      return (
        <svg viewBox="0 0 50 50" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M31 6a13 13 0 1 0 11 19A11 11 0 0 1 31 6z" fill="var(--ember)" stroke="none" />
          <path d="M9 40c5 4 11 6 16 6s11-2 16-6" />
          <path d="M14 44l-2 3M25 46v3.5M36 44l2 3" />
        </svg>
      );
    case 'kalak':
      // Three answer slips, one of them true.
      return (
        <svg viewBox="0 0 50 50" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
          <rect x="4" y="8" width="30" height="10" rx="2" transform="rotate(-6 19 13)" />
          <rect x="12" y="21" width="32" height="10" rx="2" fill="var(--brass)" />
          <rect x="6" y="34" width="30" height="10" rx="2" transform="rotate(5 21 39)" />
          <path d="M17 26h16" stroke="var(--paper-ink)" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'picture-puzzle':
      // Picture + picture = ?
      return (
        <svg viewBox="0 0 50 50" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <rect x="2" y="15" width="16" height="16" rx="2" />
          <path d="M4 28l5-6 4 4 3-3 2 2" />
          <path d="M21 23h4M23 21v4" />
          <rect x="28" y="15" width="16" height="16" rx="2" fill="var(--brass)" stroke="none" />
          <circle cx="36" cy="23" r="4" stroke="var(--paper-ink)" />
          <path d="M23 40h4M23 43h4" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 50 50" aria-hidden="true">
          <rect x="10" y="10" width="30" height="30" rx="4" fill="none" stroke="currentColor" />
        </svg>
      );
  }
}
