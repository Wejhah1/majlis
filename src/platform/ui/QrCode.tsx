import { useMemo } from 'react';
import { encode } from 'uqr';

/** Crisp vector QR in the current text colour. */
export function QrCode({ value, size = 180, label }: { value: string; size?: number; label: string }) {
  const path = useMemo(() => {
    const { data, size: n } = encode(value, { ecc: 'M', border: 1 });
    let d = '';
    data.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) d += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { d, n };
  }, [value]);
  return (
    <svg className="qr" viewBox={`0 0 ${path.n} ${path.n}`} width={size} height={size} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={path.n} height={path.n} fill="var(--paper)" />
      <path d={path.d} fill="var(--paper-ink)" />
    </svg>
  );
}
