const DEFAULT_DELAY_MS = Number(process.env.RATE_LIMIT_PER_HOST_MS ?? 2000);

class HostRateLimiter {
  private lastRequest = new Map<string, number>();

  async wait(host: string, delayMs: number = DEFAULT_DELAY_MS): Promise<void> {
    const last = this.lastRequest.get(host) ?? 0;
    const elapsed = Date.now() - last;
    const remaining = delayMs - elapsed;
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
    this.lastRequest.set(host, Date.now());
  }

  reset(host?: string): void {
    if (host) this.lastRequest.delete(host);
    else this.lastRequest.clear();
  }
}

export const rateLimiter = new HostRateLimiter();

export function hostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
