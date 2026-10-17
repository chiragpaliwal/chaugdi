// How to Play (GDD §4.3, milestone 4): six coach marks over a fixed table (04a–f), then
// "Play it" deals a real practice hand with tips at each new idea. Skippable at any point.

import { useEffect, useState } from 'react';
import { CoachMark } from '../components/CoachMark';
import { useAnim, useTutorialSession } from '../drivers/session';
import { PlayScreen } from '../screens/PlayScreen';
import { TARGET_SCORE, useSettings } from '../stores/settings';
import { INTRO_HAND_STEP, INTRO_VIEW, introSteps, nextTip, TUTORIAL_DEALER, TUTORIAL_PLAYERS, TUTORIAL_SEED, tutorialScript, type TipId } from '../tutorial/script';
import { MatchTable } from './SoloGame';

interface Props {
  width: number;
  height: number;
  onExit: () => void;
  /** First coach mark to show (dev references 04a–f). */
  initialStep?: number;
}

export function Tutorial(props: Props) {
  const [stage, setStage] = useState<'intro' | 'hand'>('intro');
  return stage === 'intro' ? <Intro {...props} onPlay={() => setStage('hand')} /> : <PracticeHand {...props} />;
}

function Intro({ width, height, initialStep = 0, onPlay }: Props & { onPlay: () => void }) {
  const target = useSettings((s) => TARGET_SCORE[s.matchLength]);
  const cardSize = useSettings((s) => s.cardSize);
  const [step, setStep] = useState(initialStep);
  const steps = introSteps(target);
  const last = steps.length - 1;
  const s = steps[step]!;
  return (
    <div style={{ position: 'relative', width, height }}>
      <PlayScreen v={INTRO_VIEW} width={width} height={height} cardSize={cardSize} onPlay={() => setStep(INTRO_HAND_STEP + 1)} />
      <CoachMark
        target={s.target}
        circle={s.circle}
        step={{ n: step + 1, of: steps.length }}
        title={s.title}
        body={s.body}
        passThrough={step === INTRO_HAND_STEP}
        actions={<>
          {step < last && <button className="cb bk" onClick={() => setStep(last)}>Skip</button>}
          {step > 0 && <button className="cb bk" onClick={() => setStep(step - 1)}>Back</button>}
          <button className="cb nx" onClick={() => (step < last ? setStep(step + 1) : onPlay())}>{step < last ? 'Next' : 'Play it'}</button>
        </>}
      />
    </div>
  );
}

function PracticeHand({ width, height, onExit }: Props) {
  const target = useSettings((s) => TARGET_SCORE[s.matchLength]);
  const session = useTutorialSession(() => ({
    level: 'medium', seed: TUTORIAL_SEED, dealer: TUTORIAL_DEALER, players: TUTORIAL_PLAYERS, script: tutorialScript, targetScore: target,
  }));
  const snap = useAnim(session);
  const [seen, setSeen] = useState<TipId[]>([]);
  const tip = nextTip(snap, seen, target);

  // Bots wait while a tip is open, so the table doesn't move under it.
  const open = tip !== null;
  useEffect(() => { session.driver.hold(open); }, [session, open]);

  return (
    <MatchTable width={width} height={height} session={session} snap={snap} practice
      onHome={onExit} onFinish={onExit} homeLabel="Leave the practice hand">
      {tip && (
        <CoachMark
          key={tip.id}
          target={tip.target}
          title={tip.title}
          body={tip.body}
          actions={<>
            {tip.button === 'Got it' && <button className="cb bk" onClick={onExit}>End practice</button>}
            <button className="cb nx" onClick={() => (tip.button === 'Finish' ? onExit() : setSeen([...seen, tip.id]))}>{tip.button}</button>
          </>}
        />
      )}
    </MatchTable>
  );
}
