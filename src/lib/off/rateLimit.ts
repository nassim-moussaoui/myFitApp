/** Sliding-window rate limiter (client side), plus a server-imposed cooldown. */
export class RateLimiter {
  private stamps: number[] = [];
  private blockedUntil = 0;

  constructor(
    private max: number,
    private windowMs: number,
    private now: () => number = () => Date.now(),
  ) {}

  /** Milliseconds to wait before the next call is allowed (0 = allowed now). */
  waitTime(): number {
    const t = this.now();
    this.stamps = this.stamps.filter((s) => t - s < this.windowMs);
    const cooldown = Math.max(0, this.blockedUntil - t);
    const windowWait = this.stamps.length < this.max ? 0 : this.stamps[0]! + this.windowMs - t;
    return Math.max(cooldown, windowWait);
  }

  /** Records a call. Returns false (and records nothing) when over the limit. */
  take(): boolean {
    if (this.waitTime() > 0) return false;
    this.stamps.push(this.now());
    return true;
  }

  /** The server told us to slow down. */
  block(ms: number): void {
    this.blockedUntil = Math.max(this.blockedUntil, this.now() + ms);
  }
}
