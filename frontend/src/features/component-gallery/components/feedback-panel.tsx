'use client';

import { useTranslations } from 'next-intl';
import { Badge, Tag, type BadgeTone } from '@/shared/ui/badge';
import { Alert } from '@/shared/ui/feedback';
import { Avatar, type AvatarVariant } from '@/shared/ui/menu';
import {
  ProgressBar,
  Spinner,
  type LoaderTone,
  type LoaderVariant,
  type SpinnerSize,
} from '@/shared/ui/spinner';
import { useUiSettings } from '@/shared/ui/ui-settings';
import { optionsOf, Section, Specimen, SpecimenGrid } from './specimen';

const LOADER_VARIANTS = optionsOf<LoaderVariant>({
  ring: true,
  comet: true,
  dots: true,
  bars: true,
  orbit: true,
  pulse: true,
});
const LOADER_TONES = optionsOf<LoaderTone>({
  brand: true,
  primary: true,
  current: true,
  muted: true,
});
const LOADER_SIZES = optionsOf<Exclude<SpinnerSize, number>>({
  xs: true,
  sm: true,
  md: true,
  lg: true,
  xl: true,
});
const BADGE_TONES = optionsOf<BadgeTone>({
  neutral: true,
  primary: true,
  secondary: true,
  success: true,
  warning: true,
  danger: true,
  info: true,
  outline: true,
});
const ALERT_TONES = ['info', 'success', 'warning', 'danger'] as const;
const AVATAR_VARIANTS = optionsOf<AvatarVariant>({ soft: true, solid: true });

export function FeedbackPanel() {
  const t = useTranslations('componentGallery.sample');
  const { loading } = useUiSettings();
  return (
    <div className="space-y-4">
      <Section id="loaderVariant" config="ui.loading.variant" prop="variant">
        <SpecimenGrid>
          {LOADER_VARIANTS.map((variant) => (
            <Specimen key={variant} name={variant} isDefault={variant === loading.variant}>
              <Spinner variant={variant} size="lg" />
            </Specimen>
          ))}
        </SpecimenGrid>
      </Section>

      <Section id="loaderTone" config="ui.loading.tone" prop="tone">
        <SpecimenGrid>
          {LOADER_TONES.map((tone) => (
            <Specimen key={tone} name={tone} isDefault={tone === loading.tone}>
              <Spinner tone={tone} size="lg" />
            </Specimen>
          ))}
        </SpecimenGrid>
      </Section>

      <Section id="loaderSize" prop="size">
        <SpecimenGrid>
          {LOADER_SIZES.map((size) => (
            <Specimen key={size} name={size}>
              <Spinner size={size} />
            </Specimen>
          ))}
        </SpecimenGrid>
      </Section>

      <Section id="progress" prop="value">
        <SpecimenGrid min="16rem">
          <Specimen name="value={42}" align="stretch">
            <ProgressBar value={42} showValue />
          </Specimen>
          <Specimen name="(none)" align="stretch">
            <ProgressBar />
          </Specimen>
        </SpecimenGrid>
      </Section>

      <Section id="badge" prop="tone">
        <SpecimenGrid>
          {BADGE_TONES.map((tone) => (
            <Specimen key={tone} name={tone}>
              <Badge tone={tone}>{t('status')}</Badge>
              <Badge tone={tone} dot>
                {t('status')}
              </Badge>
            </Specimen>
          ))}
          <Specimen name="<Tag>">
            <Tag>{t('tag')}</Tag>
          </Specimen>
        </SpecimenGrid>
      </Section>

      <Section id="alert" prop="tone">
        <SpecimenGrid min="18rem">
          {ALERT_TONES.map((tone) => (
            <Specimen key={tone} name={tone} align="stretch">
              <Alert tone={tone} title={t('alertTitle')}>
                {t('alertBody')}
              </Alert>
            </Specimen>
          ))}
        </SpecimenGrid>
      </Section>

      <Section id="avatar" prop="variant">
        <SpecimenGrid>
          {AVATAR_VARIANTS.map((variant) => (
            <Specimen key={variant} name={variant}>
              <Avatar name={t('person')} variant={variant} size={40} />
            </Specimen>
          ))}
        </SpecimenGrid>
      </Section>
    </div>
  );
}
