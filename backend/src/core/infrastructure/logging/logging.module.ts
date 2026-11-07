import type { IncomingMessage, ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import pino from 'pino';
import type { Options } from 'pino-http';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { resolveCorrelationId } from '#core/presentation/middleware/correlation-id.middleware.js';
import { RequestContext } from '../context/request-context.js';

/**
 * Paths removed from every log line. Logs must never contain credentials,
 * tokens, secrets or full request bodies.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-appcore-signature"]',
  'req.headers["idempotency-key"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.accessToken',
  '*.refreshToken',
  '*.idToken',
  '*.token',
  '*.code',
  '*.secret',
  '*.mfaSecret',
  '*.passwordHash',
];

/**
 * Structured JSON logging with pino. Each HTTP log line carries the correlation
 * id (as `reqId`) and, when known, the authenticated user id.
 *
 * LOG_STREAM=stderr (set by the CLI) keeps stdout free for command output.
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => {
        const toStderr = config.logging.stream === 'stderr';
        const options: Options = {
          level: config.logging.level,
          name: config.app.name,
          genReqId: (req: IncomingMessage) => resolveCorrelationId(req),
          customProps: () => {
            const ctx = RequestContext.get();
            return {
              correlationId: ctx?.correlationId,
              userId: ctx?.principal?.userId,
              client: ctx?.serviceClientId,
            };
          },
          redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
          serializers: {
            req: (req: { id: string; method: string; url: string }) => ({
              id: req.id,
              method: req.method,
              url: req.url?.split('?')[0],
            }),
            res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
          },
          customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
            if (err || res.statusCode >= 500) return 'error';
            if (res.statusCode >= 400) return 'warn';
            return 'info';
          },
          autoLogging: {
            ignore: (req: IncomingMessage) => req.url?.startsWith('/health') ?? false,
          },
          transport: config.logging.pretty
            ? {
                target: 'pino-pretty',
                options: {
                  singleLine: true,
                  translateTime: 'SYS:HH:MM:ss.l',
                  ...(toStderr ? { destination: 2 } : {}),
                },
              }
            : undefined,
        };
        // Synchronous writes: a short-lived CLI process must not lose its last lines.
        return toStderr && !config.logging.pretty
          ? { pinoHttp: [options, pino.destination({ dest: 2, sync: true })] }
          : { pinoHttp: options };
      },
    }),
  ],
})
export class LoggingModule {}
