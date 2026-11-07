import { Injectable, Logger } from '@nestjs/common';

/**
 * Metrics hook. The default implementation only logs slow requests; bind a
 * Prometheus / OpenTelemetry implementation to METRICS to export real metrics
 * without touching any feature code.
 *
 * Distributed tracing: run the process with the OpenTelemetry Node SDK
 * (`node --import ./otel.js dist/main.js`); HTTP, pg and ioredis are
 * auto-instrumented, and the correlation id is attached to every log line.
 */
export interface HttpRequestMetric {
  method: string;
  route: string;
  status: number;
  durationMs: number;
}

export interface Metrics {
  recordHttpRequest(metric: HttpRequestMetric): void;
  increment(name: string, labels?: Record<string, string>): void;
}

export const METRICS = Symbol('Metrics');

@Injectable()
export class LoggingMetrics implements Metrics {
  private readonly logger = new Logger('Metrics');
  private static readonly SLOW_MS = 1_000;

  recordHttpRequest(metric: HttpRequestMetric): void {
    if (metric.durationMs >= LoggingMetrics.SLOW_MS) {
      this.logger.warn(metric, 'Slow request');
    }
  }

  increment(_name: string, _labels?: Record<string, string>): void {
    // no-op by default
  }
}
