// Plays the sound, haptic and live-region line for each event as its animation starts,
// and pings when the turn reaches you (GDD §12.3, §12.4, §14).

import { useEffect, useState } from 'react';
import type { AnimQueue } from '../anim/queue';
import { SPEED_SCALE } from '../../shared/constants';
import { useSettings } from '../stores/settings';
import { feedbackFor, turnPrompt } from './cues';
import { HAPTIC, vibrate, type Pattern } from './haptics';
import { playCue, type Cue } from './sounds';

const KEEP = 5;

export function Feedback({ anim }: { anim: AnimQueue }) {
  const [lines, setLines] = useState<{ id: number; text: string }[]>([]);

  useEffect(() => {
    let id = 0;
    const say = (text: string) => setLines((l) => [...l.slice(1 - KEEP), { id: ++id, text }]);
    const out = (cues: { cue: Cue; delayMs: number }[], haptic?: Pattern) => {
      const s = useSettings.getState();
      if (s.sound) for (const c of cues) playCue(c.cue, c.delayMs);
      if (s.haptics && haptic !== undefined) vibrate(haptic);
    };

    const offEvent = anim.onEvent((e, u) => {
      const f = feedbackFor(e, { view: u.view, names: u.players.names, scale: SPEED_SCALE[useSettings.getState().motion] });
      out(f.cues, f.haptic);
      if (f.say) say(f.say);
    });

    let prompted: string | null = null;
    const check = () => {
      const snap = anim.getSnapshot();
      const prompt = snap.busy ? null : turnPrompt(snap.view);
      // Key on the trick or auction position so a new turn with the same prompt still pings.
      const key = prompt && `${snap.view.roundNo}:${snap.view.phase}:${snap.view.auction.log.length}:${snap.view.playedCards.length}`;
      if (key && key !== prompted) {
        out([{ cue: 'yourTurn', delayMs: 0 }], HAPTIC.yourTurn);
        say(prompt!);
      }
      prompted = key;
    };
    check();
    const offSnap = anim.subscribe(check);
    return () => { offEvent(); offSnap(); };
  }, [anim]);

  return (
    <div className="sr-only" role="log" aria-live="polite" aria-relevant="additions" aria-label="Game events">
      {lines.map((l) => <p key={l.id}>{l.text}</p>)}
    </div>
  );
}
