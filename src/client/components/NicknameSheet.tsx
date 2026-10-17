import { useEffect, useRef, useState } from 'react';
import { cleanNickname, NICKNAME_MAX } from '../../shared/nickname';

/**
 * Online play needs a nickname (GDD §10.4). Asked once, before the first room; it is
 * saved as the nickname setting.
 */
export function NicknameSheet({ initial = '', onDone, onCancel }: { initial?: string; onDone: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial);
  const [tried, setTried] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  const clean = cleanNickname(name);
  const submit = () => { setTried(true); if (clean) onDone(clean); };
  return (
    <div className="overlay" onClick={onCancel}>
      <form className="sheet roomy" role="dialog" aria-modal="true" aria-label="Pick a nickname"
        onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="grab" />
        <div className="sheet-intro">
          <h2>Pick a nickname</h2>
          <p>The other players see it at the table.</p>
        </div>
        <section className="set-grp">
          <div className="set-row">
            <label className="name-inp">
              <span className="lbl">Name</span>
              <input ref={input} aria-label="Nickname" aria-invalid={(tried && !clean) || undefined} maxLength={NICKNAME_MAX} value={name}
                placeholder="2 to 16 letters" autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
              <span className="c">{name.length}/{NICKNAME_MAX}</span>
            </label>
          </div>
        </section>
        {tried && !clean && <p className="join-msg" role="alert">Use 2 to 16 letters, and keep it friendly.</p>}
        <button type="submit" className="btn-primary">Continue</button>
      </form>
    </div>
  );
}
