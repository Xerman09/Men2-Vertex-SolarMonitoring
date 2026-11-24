export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getActiveLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
  if (envLevel && envLevel in LOG_LEVELS) {
    return envLevel;
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function formatLog(module: string, level: LogLevel, message: string, ctx?: LogContext): string {
  const timestamp = new Date().toISOString();
  const ctxStr = ctx && Object.keys(ctx).length > 0 ? ` ${JSON.stringify(ctx)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}${ctxStr}`;
}

export interface Logger {
  debug(message: string, ctx?: LogContext): void;
  info(message: string, ctx?: LogContext): void;
  warn(message: string, ctx?: LogContext, error?: unknown): void;
  error(message: string, error?: unknown, ctx?: LogContext): void;
}

export function createLogger(module: string): Logger {
  return {
    debug(message: string, ctx?: LogContext) {
      if (LOG_LEVELS['debug'] >= LOG_LEVELS[getActiveLogLevel()]) {
        console.debug(formatLog(module, 'debug', message, ctx));
      }
    },
    info(message: string, ctx?: LogContext) {
      if (LOG_LEVELS['info'] >= LOG_LEVELS[getActiveLogLevel()]) {
        console.info(formatLog(module, 'info', message, ctx));
      }
    },
    warn(message: string, ctx?: LogContext, error?: unknown) {
      if (LOG_LEVELS['warn'] >= LOG_LEVELS[getActiveLogLevel()]) {
        if (error !== undefined) {
          console.warn(formatLog(module, 'warn', message, ctx), error);
        } else {
          console.warn(formatLog(module, 'warn', message, ctx));
        }
      }
    },
    error(message: string, error?: unknown, ctx?: LogContext) {
      if (LOG_LEVELS['error'] >= LOG_LEVELS[getActiveLogLevel()]) {
        if (error !== undefined) {
          console.error(formatLog(module, 'error', message, ctx), error);
        } else {
          console.error(formatLog(module, 'error', message, ctx));
        }
      }
    },
  };
}

export const logger = createLogger('DSM');
