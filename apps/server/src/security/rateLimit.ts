/**
 * 메모리 기반 토큰 버킷 요청 제한(무료 서버 1대 기준).
 * capacity 만큼 연속 요청을 허용하고, refillPerSec 속도로 다시 채운다.
 */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; updated: number }>();

  constructor(
    private capacity: number,
    private refillPerSec: number,
    private now: () => number = Date.now,
  ) {}

  take(key: string, cost = 1): boolean {
    const t = this.now();
    const b = this.buckets.get(key) ?? { tokens: this.capacity, updated: t };
    b.tokens = Math.min(this.capacity, b.tokens + ((t - b.updated) / 1000) * this.refillPerSec);
    b.updated = t;
    if (b.tokens < cost) {
      this.buckets.set(key, b);
      return false;
    }
    b.tokens -= cost;
    this.buckets.set(key, b);
    return true;
  }

  /** 토큰을 쓰지 않고 남은 여유만 확인한다. */
  allowed(key: string): boolean {
    const b = this.buckets.get(key);
    if (!b) return true;
    const tokens = Math.min(this.capacity, b.tokens + ((this.now() - b.updated) / 1000) * this.refillPerSec);
    return tokens >= 1;
  }

  /** 오래된 버킷 정리(메모리 보호) */
  sweep(maxIdleMs = 10 * 60_000): void {
    const t = this.now();
    for (const [k, b] of this.buckets) if (t - b.updated > maxIdleMs) this.buckets.delete(k);
  }
}
