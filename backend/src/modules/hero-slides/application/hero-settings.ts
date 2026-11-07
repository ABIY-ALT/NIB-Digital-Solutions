import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  SETTINGS,
  type SettingDefinition,
  type Settings,
  type SettingValue,
} from '#core/application/ports/settings.port.js';
import { SettingsService } from '#modules/settings/application/settings.service.js';

export const HERO_NAVIGATION = ['arrows-and-dots', 'dots', 'arrows'] as const;
export type HeroNavigation = (typeof HERO_NAVIGATION)[number];

/** How the homepage carousel behaves. Stored as runtime settings ("Digital Solutions" tab). */
export interface HeroCarouselSettings {
  /** Rotate to the next slide automatically. Off: visitors navigate manually. */
  autoplay: boolean;
  /** How long each slide stays before the next one (automatic rotation). */
  intervalSeconds: number;
  /** Duration of the cross-fade between slides. */
  transitionMs: number;
  /** Pause automatic rotation while the pointer is over the carousel. */
  pauseOnHover: boolean;
  /** Which manual controls visitors see. */
  navigation: HeroNavigation;
}

const KEYS: Record<keyof HeroCarouselSettings, string> = {
  autoplay: 'marketplace.heroAutoplay',
  intervalSeconds: 'marketplace.heroIntervalSeconds',
  transitionMs: 'marketplace.heroTransitionMs',
  pauseOnHover: 'marketplace.heroPauseOnHover',
  navigation: 'marketplace.heroNavigation',
};

export const HERO_SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  {
    key: KEYS.autoplay,
    group: 'marketplace',
    type: 'boolean',
    label: 'Homepage carousel: rotate automatically',
    description: 'Off: the slides only change when visitors use the arrows, dots or swipe.',
    default: true,
  },
  {
    key: KEYS.intervalSeconds,
    group: 'marketplace',
    type: 'number',
    label: 'Homepage carousel: seconds per slide',
    default: 7,
    min: 3,
    max: 30,
    required: true,
  },
  {
    key: KEYS.transitionMs,
    group: 'marketplace',
    type: 'number',
    label: 'Homepage carousel: transition duration (ms)',
    default: 700,
    min: 200,
    max: 2000,
    required: true,
  },
  {
    key: KEYS.pauseOnHover,
    group: 'marketplace',
    type: 'boolean',
    label: 'Homepage carousel: pause while the pointer is over it',
    default: true,
  },
  {
    key: KEYS.navigation,
    group: 'marketplace',
    type: 'select',
    label: 'Homepage carousel: navigation controls',
    options: HERO_NAVIGATION,
    default: 'arrows-and-dots',
  },
];

/**
 * Reads and writes the carousel settings. Writing goes through the settings
 * service (same validation, cache and audit trail as the Settings screen), but
 * is authorised by the hero-slides permission rather than settings:manage, so
 * the people who manage the carousel can also tune it.
 */
@Injectable()
export class HeroSettingsService implements OnModuleInit {
  constructor(
    @Inject(SETTINGS) private readonly settings: Settings,
    private readonly writer: SettingsService,
  ) {}

  onModuleInit(): void {
    this.settings.define(HERO_SETTING_DEFINITIONS);
  }

  async read(): Promise<HeroCarouselSettings> {
    const values = await this.settings.all();
    const nav = values[KEYS.navigation];
    return {
      autoplay: values[KEYS.autoplay] !== false,
      intervalSeconds: Number(values[KEYS.intervalSeconds] ?? 7),
      transitionMs: Number(values[KEYS.transitionMs] ?? 700),
      pauseOnHover: values[KEYS.pauseOnHover] !== false,
      navigation: (HERO_NAVIGATION as readonly string[]).includes(String(nav))
        ? (nav as HeroNavigation)
        : 'arrows-and-dots',
    };
  }

  async update(
    changes: Partial<HeroCarouselSettings>,
    actorId: string | null,
  ): Promise<HeroCarouselSettings> {
    const values: Record<string, SettingValue> = {};
    for (const [field, value] of Object.entries(changes) as [
      keyof HeroCarouselSettings,
      SettingValue,
    ][]) {
      if (value !== undefined) values[KEYS[field]] = value;
    }
    if (Object.keys(values).length) await this.writer.update(values, actorId);
    return this.read();
  }
}
