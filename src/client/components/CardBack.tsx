export type CardBackSize = 'mini' | 'trick' | 'hand' | 'xl';

interface Props {
  size: CardBackSize;
  className?: string;
  style?: React.CSSProperties;
  label?: string;
}

/** Indigo back with the ivory block-print lattice (31-card-system). Same in both themes. */
export function CardBack({ size, className, style, label }: Props) {
  return (
    <span
      className={['card-back', size, className].filter(Boolean).join(' ')}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
