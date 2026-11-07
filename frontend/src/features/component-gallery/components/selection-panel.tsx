'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { Checkbox, RadioGroup, RadioGroupItem, Switch } from '@/shared/ui/choice';
import { Label } from '@/shared/ui/input';
import { SegmentedControl } from '@/shared/ui/widgets';
import { Section, Specimen, SpecimenGrid } from './specimen';

const PERIODS = ['daily', 'weekly', 'monthly'] as const;
type Period = (typeof PERIODS)[number];

export function SelectionPanel() {
  const t = useTranslations('componentGallery.sample');
  const id = useId();
  const [period, setPeriod] = useState<Period>('weekly');
  const periods = PERIODS.map((value) => ({ value, label: t(value) }));

  return (
    <div className="space-y-4">
      <Section id="checkbox" prop="checked">
        <SpecimenGrid min="12rem">
          <Specimen name="false">
            <Checkbox id={`${id}-c1`} />
            <Label htmlFor={`${id}-c1`} className="font-normal">
              {t('remember')}
            </Label>
          </Specimen>
          <Specimen name="true">
            <Checkbox id={`${id}-c2`} defaultChecked />
            <Label htmlFor={`${id}-c2`} className="font-normal">
              {t('remember')}
            </Label>
          </Specimen>
          <Specimen name='"indeterminate"'>
            <Checkbox id={`${id}-c3`} checked="indeterminate" />
            <Label htmlFor={`${id}-c3`} className="font-normal">
              {t('selectAll')}
            </Label>
          </Specimen>
          <Specimen name="disabled">
            <Checkbox id={`${id}-c4`} defaultChecked disabled />
            <Label htmlFor={`${id}-c4`} className="font-normal">
              {t('disabled')}
            </Label>
          </Specimen>
        </SpecimenGrid>
      </Section>

      <Section id="switch" prop="checked">
        <SpecimenGrid min="12rem">
          <Specimen name="true">
            <Switch id={`${id}-s1`} defaultChecked />
            <Label htmlFor={`${id}-s1`} className="font-normal">
              {t('notify')}
            </Label>
          </Specimen>
          <Specimen name="false">
            <Switch id={`${id}-s2`} />
            <Label htmlFor={`${id}-s2`} className="font-normal">
              {t('notify')}
            </Label>
          </Specimen>
          <Specimen name="disabled">
            <Switch id={`${id}-s3`} disabled />
            <Label htmlFor={`${id}-s3`} className="font-normal">
              {t('disabled')}
            </Label>
          </Specimen>
        </SpecimenGrid>
      </Section>

      <Section id="radio" prop="orientation">
        <SpecimenGrid min="16rem">
          {(['vertical', 'horizontal'] as const).map((orientation) => (
            <Specimen key={orientation} name={orientation}>
              <RadioGroup
                aria-label={t('period')}
                defaultValue="weekly"
                orientation={orientation}
                className={orientation === 'horizontal' ? 'flex flex-wrap gap-x-5' : undefined}
              >
                {periods.map((p) => (
                  <div key={p.value} className="flex items-center gap-2">
                    <RadioGroupItem id={`${id}-${orientation}-${p.value}`} value={p.value} />
                    <Label htmlFor={`${id}-${orientation}-${p.value}`} className="font-normal">
                      {p.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </Specimen>
          ))}
        </SpecimenGrid>
      </Section>

      <Section id="segmented" prop="size">
        <SpecimenGrid min="16rem">
          {(['sm', 'md'] as const).map((size) => (
            <Specimen key={size} name={size}>
              <SegmentedControl
                label={t('period')}
                size={size}
                value={period}
                onChange={setPeriod}
                options={periods}
              />
            </Specimen>
          ))}
        </SpecimenGrid>
      </Section>
    </div>
  );
}
