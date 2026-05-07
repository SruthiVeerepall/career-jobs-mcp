type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const configuredLevel: LogLevel = ((): LogLevel => {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  return (['debug', 'info', 'warn', 'error'] as LogLevel[]).includes(raw as LogLevel)
    ? (raw as LogLevel)
    : 'info';
})();

function emit(level: LogLevel, message: string, extra?: unknown): void {
  if (LEVELS[level] < LEVELS[configuredLevel]) return;
  const ts = new Date().toISOString();
  const line = `[${ts}] ${level.toUpperCase()} ${message}`;
  // MCP servers communicate over stdout via JSON-RPC, so logs MUST go to stderr.
  if (extra !== undefined) {
    process.stderr.write(`${line} ${safeStringify(extra)}\n`);
  } else {
    process.stderr.write(`${line}\n`);
  }
}

function safeStringify(value: unknown): string {
  try {
    if (value instanceof Error) return `${value.message}\n${value.stack ?? ''}`;
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const logger = {
  debug: (msg: string, extra?: unknown) => emit('debug', msg, extra),
  info: (msg: string, extra?: unknown) => emit('info', msg, extra),
  warn: (msg: string, extra?: unknown) => emit('warn', msg, extra),
  error: (msg: string, extra?: unknown) => emit('error', msg, extra),
};
