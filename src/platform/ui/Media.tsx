import { useMemo, useState, type CSSProperties } from 'react';
import { thumbHashToDataURL } from 'thumbhash';
import type { AssetRef } from '../../games/types';

export const mediaUrl = (asset: AssetRef, width: number) => `/media/${asset.key}-${width}.webp`;

function placeholder(thumb: string) {
  try {
    const bytes = Uint8Array.from(atob(thumb), (c) => c.charCodeAt(0));
    return thumbHashToDataURL(bytes);
  } catch {
    return undefined;
  }
}

/**
 * An uploaded image with its ThumbHash blur painted instantly underneath, so cards never
 * jump or show a spinner. `sizes` tells the browser which of the pre-made widths to fetch.
 */
export function MediaImage({
  asset,
  alt,
  sizes = '200px',
  className,
  style,
  eager = false,
}: {
  asset: AssetRef;
  alt: string;
  sizes?: string;
  className?: string;
  style?: CSSProperties;
  eager?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const blur = useMemo(() => placeholder(asset.thumb), [asset.thumb]);
  const widths = [...asset.widths].sort((a, b) => a - b);
  return (
    <img
      className={className}
      alt={alt}
      src={mediaUrl(asset, widths[Math.min(1, widths.length - 1)]!)}
      srcSet={widths.map((w) => `${mediaUrl(asset, w)} ${w}w`).join(', ')}
      sizes={sizes}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      onLoad={() => setLoaded(true)}
      // A missing file should vanish quietly, never show a broken-image icon.
      onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
      style={{
        ...style,
        objectFit: 'cover',
        backgroundImage: loaded || !blur ? undefined : `url(${blur})`,
        backgroundSize: 'cover',
      }}
    />
  );
}

/** Warm the browser cache with the small size of every card before the deal. */
export function preload(assets: AssetRef[], width = 320) {
  for (const a of assets) {
    const w = a.widths.reduce((best, x) => (Math.abs(x - width) < Math.abs(best - width) ? x : best), a.widths[0]!);
    const img = new Image();
    img.decoding = 'async';
    img.src = mediaUrl(a, w);
  }
}

// Curated, warm-leaning avatar tints (no rainbow, no purple).
const TINTS = ['oklch(0.62 0.12 35)', 'oklch(0.66 0.11 70)', 'oklch(0.58 0.09 160)', 'oklch(0.56 0.1 230)', 'oklch(0.6 0.12 10)', 'oklch(0.64 0.08 110)'];

function tintFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return TINTS[h % TINTS.length];
}

/** A friend's face: their uploaded portrait, or their initial on a tinted tile. */
export function Avatar({ name, portrait, size = 40, className }: { name: string; portrait: AssetRef | null; size?: number; className?: string }) {
  const style = { inlineSize: size, blockSize: size } as CSSProperties;
  if (portrait)
    return <MediaImage asset={portrait} alt="" sizes={`${size * 2}px`} className={['avatar', className].filter(Boolean).join(' ')} style={style} />;
  return (
    <span className={['avatar avatar--initial', className].filter(Boolean).join(' ')} style={{ ...style, background: tintFor(name), fontSize: size * 0.42 }} aria-hidden="true">
      {[...name.trim()][0] ?? '?'}
    </span>
  );
}
