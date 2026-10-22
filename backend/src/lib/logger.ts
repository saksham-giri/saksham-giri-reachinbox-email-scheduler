type Level = 'debug' | 'info' | 'warn' | 'error';

function log(level: Level, scope: string, message: string, meta?: unknown) {
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}`;
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  if (meta === undefined) out(line);
  else out(line, meta instanceof Error ? meta.message : meta);
}

export function createLogger(scope: string) {
  return {
    debug: (msg: string, meta?: unknown) => log('debug', scope, msg, meta),
    info: (msg: string, meta?: unknown) => log('info', scope, msg, meta),
    warn: (msg: string, meta?: unknown) => log('warn', scope, msg, meta),
    error: (msg: string, meta?: unknown) => log('error', scope, msg, meta),
  };
}
