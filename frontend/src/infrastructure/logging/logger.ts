import pino from 'pino';
import pretty from 'pino-pretty';

/**
 * Structured server-side logger (BFF). Every line should carry the
 * correlationId of the request. Sensitive fields are redacted.
 */
const level = process.env.LOG_LEVEL ?? 'info';
const usePretty = process.env.LOG_PRETTY === 'true';

export const logger = pino(
  {
    name: 'appcore-bff',
    level,
    redact: {
      paths: [
        '*.password',
        '*.code',
        '*.token',
        '*.accessToken',
        '*.refreshToken',
        '*.idToken',
        '*.authorization',
        '*.cookie',
        'headers.cookie',
        'headers.authorization',
      ],
      censor: '[REDACTED]',
    },
  },
  usePretty ? pretty({ sync: true, singleLine: true, translateTime: 'SYS:HH:MM:ss.l' }) : undefined,
);

export type Logger = typeof logger;
