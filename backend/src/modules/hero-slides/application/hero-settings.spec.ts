import { describe, expect, it } from 'vitest';
import type { Settings, SettingValue } from '#core/application/ports/settings.port.js';
import type { SettingsService } from '#modules/settings/application/settings.service.js';
import { HERO_SETTING_DEFINITIONS, HeroSettingsService } from './hero-settings.js';

function setup(stored: Record<string, SettingValue> = {}) {
  const values: Record<string, SettingValue> = Object.fromEntries(
    HERO_SETTING_DEFINITIONS.map((d) => [d.key, d.default]),
  );
  Object.assign(values, stored);
  const writes: Record<string, SettingValue>[] = [];
  const settings = {
    define: () => undefined,
    all: () => Promise.resolve({ ...values }),
  } as unknown as Settings;
  const writer = {
    update: (changes: Record<string, SettingValue>) => {
      writes.push(changes);
      Object.assign(values, changes);
      return Promise.resolve({ ...values });
    },
  } as unknown as SettingsService;
  return { service: new HeroSettingsService(settings, writer), writes };
}

describe('HeroSettingsService', () => {
  it('reads the defaults', async () => {
    expect(await setup().service.read()).toEqual({
      autoplay: true,
      intervalSeconds: 7,
      transitionMs: 700,
      pauseOnHover: true,
      navigation: 'arrows-and-dots',
    });
  });

  it('writes only the fields sent, under their setting keys', async () => {
    const { service, writes } = setup();
    const after = await service.update({ intervalSeconds: 9, autoplay: false }, 'editor');
    expect(writes).toEqual([
      { 'marketplace.heroIntervalSeconds': 9, 'marketplace.heroAutoplay': false },
    ]);
    expect(after.intervalSeconds).toBe(9);
    expect(after.autoplay).toBe(false);
    expect(after.navigation).toBe('arrows-and-dots');
  });

  it('does not write when nothing is sent', async () => {
    const { service, writes } = setup();
    await service.update({}, 'editor');
    expect(writes).toEqual([]);
  });

  it('falls back to the default navigation for an unknown stored value', async () => {
    const { service } = setup({ 'marketplace.heroNavigation': 'carousel' });
    expect((await service.read()).navigation).toBe('arrows-and-dots');
  });

  it('defines every carousel setting in the Digital Solutions group', () => {
    expect(HERO_SETTING_DEFINITIONS.every((d) => d.group === 'marketplace')).toBe(true);
    expect(HERO_SETTING_DEFINITIONS.map((d) => d.key)).toEqual([
      'marketplace.heroAutoplay',
      'marketplace.heroIntervalSeconds',
      'marketplace.heroTransitionMs',
      'marketplace.heroPauseOnHover',
      'marketplace.heroNavigation',
    ]);
  });
});
