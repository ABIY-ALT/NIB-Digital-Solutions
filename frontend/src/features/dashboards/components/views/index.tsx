'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import type { DashboardDataMap, DashboardId } from '../../types';
import { DashboardSkeleton } from '../dashboard-skeleton';
import type { DashboardViewProps } from './parts';

/** While a view's code downloads, that dashboard's own skeleton shows. */
const loading = (id: DashboardId) =>
  function Loading() {
    return <DashboardSkeleton id={id} />;
  };

/**
 * One view per catalogue dashboard, each code-split: opening the CRM dashboard
 * never downloads the logistics one. The mapped type makes a missing view (or
 * a view for the wrong payload) a compile error. Keep each import() inline in
 * its dynamic() call: Next.js reads it there to split and preload the chunk.
 */
export const DASHBOARD_VIEWS: {
  [K in DashboardId]: ComponentType<DashboardViewProps<DashboardDataMap[K]>>;
} = {
  crm: dynamic(() => import('./crm-dashboard').then((m) => m.CrmDashboardView), {
    loading: loading('crm'),
  }),
  analytics: dynamic(() => import('./analytics-dashboard').then((m) => m.AnalyticsDashboardView), {
    loading: loading('analytics'),
  }),
  ecommerce: dynamic(() => import('./ecommerce-dashboard').then((m) => m.EcommerceDashboardView), {
    loading: loading('ecommerce'),
  }),
  academy: dynamic(() => import('./academy-dashboard').then((m) => m.AcademyDashboardView), {
    loading: loading('academy'),
  }),
  logistics: dynamic(() => import('./logistics-dashboard').then((m) => m.LogisticsDashboardView), {
    loading: loading('logistics'),
  }),
  finance: dynamic(() => import('./finance-dashboard').then((m) => m.FinanceDashboardView), {
    loading: loading('finance'),
  }),
  support: dynamic(() => import('./support-dashboard').then((m) => m.SupportDashboardView), {
    loading: loading('support'),
  }),
  hr: dynamic(() => import('./hr-dashboard').then((m) => m.HrDashboardView), {
    loading: loading('hr'),
  }),
};
