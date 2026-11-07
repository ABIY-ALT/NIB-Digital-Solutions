'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button, type ButtonAppearance, type ButtonProps } from '@/shared/ui/button';
import { useUiSettings } from '@/shared/ui/ui-settings';
import { optionsOf, Section, Specimen, SpecimenGrid } from './specimen';

type Variant = NonNullable<ButtonProps['variant']>;
type Size = NonNullable<ButtonProps['size']>;

const APPEARANCES = optionsOf<ButtonAppearance>({
  solid: true,
  soft: true,
  outline: true,
  elevated: true,
});
const VARIANTS = optionsOf<Variant>({
  primary: true,
  secondary: true,
  danger: true,
  outline: true,
  ghost: true,
  subtle: true,
  link: true,
});
/** Variants the appearance applies to. */
const COLOURED: Variant[] = ['primary', 'secondary', 'danger'];
const SIZES = optionsOf<Size>({ sm: true, md: true, lg: true, icon: true, 'icon-sm': true });

export function ButtonsPanel() {
  const t = useTranslations('componentGallery.sample');
  const { controls } = useUiSettings();
  return (
    <div className="space-y-4">
      <Section id="buttonAppearance" config="ui.controls.button" prop="appearance">
        <SpecimenGrid min="18rem">
          {APPEARANCES.map((appearance) => (
            <Specimen key={appearance} name={appearance} isDefault={appearance === controls.button}>
              {COLOURED.map((variant) => (
                <Button key={variant} variant={variant} appearance={appearance}>
                  {variant}
                </Button>
              ))}
            </Specimen>
          ))}
        </SpecimenGrid>
      </Section>

      <Section id="buttonVariant" prop="variant">
        <SpecimenGrid>
          {VARIANTS.map((variant) => (
            <Specimen key={variant} name={variant}>
              <Button variant={variant}>{t('save')}</Button>
            </Specimen>
          ))}
        </SpecimenGrid>
      </Section>

      <Section id="buttonSize" prop="size">
        <SpecimenGrid>
          {SIZES.map((size) => (
            <Specimen key={size} name={size}>
              {size.startsWith('icon') ? (
                <Button size={size} aria-label={t('add')}>
                  <Plus />
                </Button>
              ) : (
                <Button size={size}>{t('save')}</Button>
              )}
            </Specimen>
          ))}
        </SpecimenGrid>
      </Section>

      <Section id="buttonState">
        <SpecimenGrid>
          <Specimen name="<Plus /> + text">
            <Button>
              <Plus />
              {t('add')}
            </Button>
          </Specimen>
          <Specimen name="loading">
            <Button loading>{t('saving')}</Button>
          </Specimen>
          <Specimen name="disabled">
            <Button disabled>{t('disabled')}</Button>
          </Specimen>
        </SpecimenGrid>
      </Section>
    </div>
  );
}
