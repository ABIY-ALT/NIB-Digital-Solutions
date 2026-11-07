import type { DashboardDataMap, DashboardId, DashboardRange } from '../types';
import { academySample } from './academy.sample';
import { analyticsSample } from './analytics.sample';
import { crmSample } from './crm.sample';
import { ecommerceSample } from './ecommerce.sample';
import { financeSample } from './finance.sample';
import { hrSample } from './hr.sample';
import { logisticsSample } from './logistics.sample';
import { supportSample } from './support.sample';

/** Deterministic sample payload per dashboard (pure functions: safe on server and in tests). */
export const SAMPLES: {
  [K in DashboardId]: (range: DashboardRange, now: Date) => DashboardDataMap[K];
} = {
  crm: crmSample,
  analytics: analyticsSample,
  ecommerce: ecommerceSample,
  academy: academySample,
  logistics: logisticsSample,
  finance: financeSample,
  support: supportSample,
  hr: hrSample,
};
