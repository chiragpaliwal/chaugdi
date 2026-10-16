import { useRef, useState } from 'react';

export function Segmented<T extends string>({ label, options, value, onChange, full, tall }: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  full?: boolean;
  tall?: boolean;
}) {
  return (
    <div className={`seg${full ? ' full' : ''}${tall ? ' tall' : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'on' : ''} role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <button className={`switch${checked ? ' on' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />;
}

/** Room codes use 23456789ABCDEFGHJKMNPQRSTUVWXYZ (GDD §10.8): no 0, O, 1, I, L. */
export const ROOM_CODE_LENGTH = 5;
const CODE_CHARS = /[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]/g;
export const cleanRoomCode = (s: string) => s.toUpperCase().replace(CODE_CHARS, '').slice(0, ROOM_CODE_LENGTH);

/** Boxes over one real input (HANDOFF §4 RoomCodeField), 5 characters. */
export function RoomCodeField({ value, onChange, onSubmit, invalid }: { value: string; onChange: (v: string) => void; onSubmit?: () => void; invalid?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  return (
    <div className={`code-field${invalid ? ' bad' : ''}`} onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        aria-label={`Room code, ${ROOM_CODE_LENGTH} characters`}
        aria-invalid={invalid || undefined}
        // No maxLength: it would cut pasted text before invalid characters are dropped.
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(cleanRoomCode(e.target.value))}
        onKeyDown={(e) => { if (e.key === 'Enter') onSubmit?.(); }}
      />
      {Array.from({ length: ROOM_CODE_LENGTH }, (_, i) => {
        const ch = value[i];
        // The box holding the last typed character carries the amber ring (01-home).
        const cur = (focused || value.length > 0) && i === Math.max(0, value.length - 1);
        return <span key={i} aria-hidden="true" className={[cur ? 'cur' : '', ch ? '' : 'ph'].filter(Boolean).join(' ')}>{ch ?? '·'}</span>;
      })}
    </div>
  );
}
