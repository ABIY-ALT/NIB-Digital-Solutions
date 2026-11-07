import 'server-only';
import { notFound } from 'next/navigation';
import { isFeatureEnabled } from './app-config.schema';
import { appConfig } from './app.config';

/** Server guard for pages/route handlers behind a flag: a disabled feature does not exist (404). */
export function requireFeature(flag: string): void {
  if (!isFeatureEnabled(appConfig, flag)) notFound();
}
