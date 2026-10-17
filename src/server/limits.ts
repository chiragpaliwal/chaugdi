// Per-connection abuse limits (GDD §10.9).

import { ONLINE } from '../shared/constants';

/** Token bucket: `rate` messages per second with a burst of `rate`. */
export class RateLimiter {
  private tokens: number;
  private at: number;
  constructor(private readonly rate: number = ONLINE.maxMessagesPerSecond, now = Date.now()) {
    this.tokens = rate;
    this.at = now;
  }
  take(now = Date.now()): boolean {
    this.tokens = Math.min(this.rate, this.tokens + ((now - this.at) / 1000) * this.rate);
    this.at = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** UTF-8 size of a socket message; binary frames count their byte length. */
export function payloadBytes(message: string | ArrayBuffer | ArrayBufferView): number {
  if (typeof message === 'string') return new TextEncoder().encode(message).length;
  return message.byteLength;
}
