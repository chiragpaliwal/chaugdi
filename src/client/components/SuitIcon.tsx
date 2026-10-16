import type { Suit } from '../../engine/types';

// HANDOFF §2: suits are inline SVG, never emoji or font glyphs in UI chrome.
export const SUIT_PATHS: Record<Suit, string> = {
  S: 'M12 2C9 6.5 3 9.5 3 14c0 2.8 2.2 4.6 4.6 4.6 1.6 0 2.9-.7 3.6-1.8L10 22h4l-1.2-5.2c.7 1.1 2 1.8 3.6 1.8 2.4 0 4.6-1.8 4.6-4.6C21 9.5 15 6.5 12 2z',
  H: 'M12 21.5C8 18.6 2.5 14.6 2.5 9.4 2.5 6.4 4.8 4 7.6 4c1.9 0 3.4 1 4.4 2.6C13 5 14.5 4 16.4 4c2.8 0 5.1 2.4 5.1 5.4 0 5.2-5.5 9.2-9.5 12.1z',
  D: 'M12 1.5 19.5 12 12 22.5 4.5 12z',
  C: 'M12 2.5a4.3 4.3 0 0 0-4.1 5.6 4.3 4.3 0 1 0 2.6 7.9L9.6 22h4.8l-.9-6a4.3 4.3 0 1 0 2.6-7.9A4.3 4.3 0 0 0 12 2.5z',
};

interface Props {
  suit: Suit;
  className?: string;
  style?: React.CSSProperties;
  /** Defaults to decorative. Pass a label when the icon carries meaning alone. */
  label?: string;
}

export function SuitIcon({ suit, className, style, label }: Props) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}>
      <path d={SUIT_PATHS[suit]} fill="currentColor" />
    </svg>
  );
}
