import { logger } from './logger.js';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  context?: string;
}

const DEFAULTS: Required<Omit<RetryOptions, 'context'>> = {
  maxRetries: Number(process.env.MAX_RETRIES ?? 1),
  initialDelayMs: 500,
  maxDelayMs: 5000,
};

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const settings = { ...DEFAULTS, ...opts };
  let lastError: unknown;
  for (let attempt = 0; attempt <= settings.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === settings.maxRetries) break;
      const delay = Math.min(settings.initialDelayMs * 2 ** attempt, settings.maxDelayMs);
      logger.warn(
        `Retry ${attempt + 1}/${settings.maxRetries}${opts.context ? ` for ${opts.context}` : ''} after ${delay}ms`,
        err instanceof Error ? err.message : err,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${label} exceeded ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
