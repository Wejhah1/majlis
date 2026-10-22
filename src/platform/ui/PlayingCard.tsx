import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useTilt } from './useTilt';
import './playing-card.css';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  /** Holographic sheen for special cards (roles, assassin, winners). */
  foil?: boolean;
};

/** A physical-feeling card: cream stock, tilt toward the pointer, light sheen. */
export function PlayingCard({ children, foil = false, className, ...rest }: Props) {
  const tilt = useTilt<HTMLButtonElement>();
  return (
    <button
      type="button"
      {...rest}
      {...tilt}
      className={['playing-card', foil && 'is-foil', className].filter(Boolean).join(' ')}
    >
      <span className="playing-card__face">{children}</span>
      <span className="playing-card__sheen" aria-hidden="true" />
    </button>
  );
}
