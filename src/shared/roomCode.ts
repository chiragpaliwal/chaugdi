// Room codes (GDD §10.8): 5 characters with no 0/O/1/I/L.

export const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const PATTERN = new RegExp(`^[${CODE_CHARS}]{5}$`);
export const isRoomCode = (s: string) => PATTERN.test(s);

export function newRoomCode(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}
