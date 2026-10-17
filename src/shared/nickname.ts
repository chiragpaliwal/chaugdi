// Nickname rules (GDD §10.9): 2–16 characters after trimming, a basic profanity filter.

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 16;

// Matched against the name with spaces, digits-as-letters and punctuation folded away.
const BLOCKED = ['fuck', 'shit', 'cunt', 'bitch', 'nigg', 'fag', 'rape', 'chutiya', 'madarchod', 'bhenchod', 'behenchod', 'gandu', 'randi', 'bhosdi', 'lauda', 'lund'];
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };

/** The cleaned nickname, or null when it is too short, too long or blocked. */
export function cleanNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // Drop control and invisible formatting characters, then collapse runs of spaces.
  const name = raw.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim();
  const length = [...name].length;
  if (length < NICKNAME_MIN || length > NICKNAME_MAX) return null;
  const folded = name.toLowerCase().replace(/[013457@$]/g, (c) => LEET[c] ?? c).replace(/[^\p{L}]/gu, '');
  return BLOCKED.some((w) => folded.includes(w)) ? null : name;
}
