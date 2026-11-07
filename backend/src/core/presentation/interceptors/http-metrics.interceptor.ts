import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { finalize, type Observable } from 'rxjs';
import { METRICS, type Metrics } from '#core/infrastructure/telemetry/metrics.js';

/** Feeds request duration/status into the Metrics hook. */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(@Inject(METRICS) private readonly metrics: Metrics) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const started = performance.now();
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      finalize(() =>
        this.metrics.recordHttpRequest({
          method: req.method,
          route: req.route ? String((req.route as { path: string }).path) : 'unmatched',
          status: res.statusCode,
          durationMs: Math.round(performance.now() - started),
        }),
      ),
    );
  }
}
