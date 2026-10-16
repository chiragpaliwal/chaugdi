/** Chaugadi Tailwind theme. Colours read the CSS variables in chaugadi-tokens.css,
 *  so dark/light/2-colour switching happens with data attributes, not class variants. */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: 'var(--bg)', deep: 'var(--bg-deep)' },
        surface: { 1: 'var(--surface-1)', 2: 'var(--surface-2)', 3: 'var(--surface-3)' },
        line: 'var(--line)',
        felt: { in: 'var(--felt-in)', out: 'var(--felt-out)', rim: 'var(--rim)' },
        ghost: 'var(--ghost)',
        ink: { DEFAULT: 'var(--text)', 2: 'var(--text-2)', dim: 'var(--text-dim)', faint: 'var(--text-faint)' },
        amber: { DEFAULT: 'var(--amber)', on: 'var(--on-amber)', ink: 'var(--amber-ink)' },
        win: { DEFAULT: 'var(--blue)', on: 'var(--on-blue)', ring: 'var(--blue-ring)' },
        fail: { DEFAULT: 'var(--coral)', on: 'var(--on-coral)' },
        team: { a: 'var(--team-a)', b: 'var(--team-b)' },
        hukum: 'var(--hukum)',
        card: { DEFAULT: 'var(--card)', line: 'var(--card-line)', back: 'var(--back)' },
        suit: {
          s: 'var(--suit-s)', h: 'var(--suit-h)', d: 'var(--suit-d)', c: 'var(--suit-c)',
          's-ui': 'var(--suit-s-ui)', 'h-ui': 'var(--suit-h-ui)', 'd-ui': 'var(--suit-d-ui)', 'c-ui': 'var(--suit-c-ui)',
        },
      },
      fontFamily: {
        ui: ['"Bricolage Grotesque Variable"', '"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      fontSize: {
        label: ['10px', { lineHeight: '1', letterSpacing: '.09em', fontWeight: '700' }],
        seat: ['12px', { lineHeight: '1', fontWeight: '600' }],
        body: ['14px', { lineHeight: '1.4' }],
        sheet: ['20px', { lineHeight: '1.1', fontWeight: '800' }],
        display: ['40px', { lineHeight: '1', letterSpacing: '-.02em', fontWeight: '800' }],
      },
      borderRadius: {
        'card-sm': 'var(--r-card-sm)', card: 'var(--r-card)', chip: 'var(--r-chip)',
        btn: 'var(--r-btn)', panel: 'var(--r-panel)', sheet: 'var(--r-sheet)',
      },
      boxShadow: { trick: 'var(--shadow-trick)', hand: 'var(--shadow-hand)', sheet: 'var(--shadow-sheet)' },
      spacing: { tap: '44px', cta: '52px' },
      transitionTimingFunction: { travel: 'var(--ease-travel)' },
      transitionDuration: {
        micro: 'calc(var(--dur-micro) * var(--motion-scale))',
        state: 'calc(var(--dur-state) * var(--motion-scale))',
        play: 'calc(var(--dur-play) * var(--motion-scale))',
        sweep: 'calc(var(--dur-sweep) * var(--motion-scale))',
      },
      keyframes: {
        turn: { '0%,100%': { opacity: '.75' }, '50%': { opacity: '1' } },
        breathe: { '0%,100%': { opacity: '.35' }, '50%': { opacity: '1' } },
        pop: { '0%': { transform: 'scale(.6)', opacity: '0' }, '70%': { transform: 'scale(1.08)', opacity: '1' }, '100%': { transform: 'scale(1)' } },
      },
      animation: {
        turn: 'turn 1.6s ease-in-out infinite',
        breathe: 'breathe 1.6s ease-in-out infinite',
        pop: 'pop 240ms var(--ease-travel) both',
      },
    },
  },
  plugins: [],
};
