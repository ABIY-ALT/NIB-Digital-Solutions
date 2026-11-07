'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { useFormats } from '@/features/settings/hooks/use-settings';
import { lineAmount, lineTotals } from '@/shared/lib/line-items';
import { Form, FormActions, FormGrid, SubmitButton, TextField } from '@/shared/ui/form';
import { NumberField } from '@/shared/ui/form-fields';
import { LineItemsField } from '@/shared/ui/line-items-field';
import { Section } from './specimen';

/**
 * Master–detail form: header fields, line items with a computed amount, and
 * totals in the product's money format (Administration › Settings › Formats).
 */
export function FormsPanel() {
  const t = useTranslations('componentGallery.sample');
  const { money, format } = useFormats();
  const [submitted, setSubmitted] = useState<string | null>(null);

  const schema = z.object({
    customer: z.string().trim().min(1, t('lineItems.customerRequired')),
    taxRate: z.number().min(0).max(100).nullable(),
    items: z
      .array(
        z.object({
          description: z.string().trim().min(1, t('lineItems.descriptionRequired')),
          unit: z.string(),
          quantity: z
            .number({ error: t('lineItems.quantityRequired') })
            .positive(t('lineItems.quantityRequired')),
          price: z.number({ error: t('lineItems.priceRequired') }).min(0),
        }),
      )
      .min(1, t('lineItems.atLeastOne')),
  });
  type Values = z.input<typeof schema>;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer: t('person'),
      taxRate: 15,
      items: [
        { description: t('lineItems.sampleA'), unit: 'each', quantity: 2, price: 1250 },
        { description: t('lineItems.sampleB'), unit: 'hour', quantity: 6, price: 480.5 },
      ],
    },
  });
  const taxRate = useWatch({ control: form.control, name: 'taxRate' });

  return (
    <Section id="lineItems" prop="<LineItemsField>">
      <Form
        form={form}
        onSubmit={(values) => {
          const totals = lineTotals(values.items, {
            taxRate: values.taxRate,
            decimals: format.decimals,
          });
          setSubmitted(
            t('lineItems.submitted', { count: values.items.length, total: money(totals.total) }),
          );
        }}
      >
        <FormGrid columns={2}>
          <TextField<Values> name="customer" label={t('lineItems.customer')} required />
          <NumberField<Values> name="taxRate" label={t('lineItems.taxRate')} min={0} max={100} />
        </FormGrid>
        <LineItemsField<Values, 'items'>
          name="items"
          label={t('lineItems.items')}
          description={t('lineItems.hint')}
          minRows={1}
          maxRows={20}
          newRow={() => ({ description: '', unit: 'each', quantity: 1, price: 0 })}
          columns={[
            {
              key: 'description',
              label: t('lineItems.description'),
              type: 'text',
              width: 'minmax(10rem,3fr)',
              maxLength: 120,
            },
            {
              key: 'unit',
              label: t('lineItems.unit'),
              type: 'select',
              width: '7rem',
              options: [
                { value: 'each', label: t('lineItems.units.each') },
                { value: 'hour', label: t('lineItems.units.hour') },
                { value: 'day', label: t('lineItems.units.day') },
              ],
            },
            {
              key: 'quantity',
              label: t('lineItems.quantity'),
              type: 'number',
              min: 0,
              width: '6rem',
              align: 'end',
            },
            {
              key: 'price',
              label: t('lineItems.price'),
              type: 'number',
              min: 0,
              step: 0.01,
              width: '8rem',
              align: 'end',
            },
            {
              key: 'amount',
              label: t('lineItems.amount'),
              type: 'computed',
              width: 'minmax(8rem,1fr)',
              align: 'end',
              compute: (row) => money(lineAmount(row, format.decimals)),
            },
          ]}
          summary={(rows) => {
            const totals = lineTotals(rows, { taxRate, decimals: format.decimals });
            return [
              { label: t('lineItems.subtotal'), value: money(totals.subtotal) },
              { label: t('lineItems.tax', { rate: taxRate ?? 0 }), value: money(totals.tax) },
              { label: t('lineItems.total'), value: money(totals.total), emphasis: true },
            ];
          }}
        />
        <FormActions>
          {submitted ? (
            <output className="me-auto self-center text-sm text-success">{submitted}</output>
          ) : null}
          <SubmitButton>{t('save')}</SubmitButton>
        </FormActions>
      </Form>
    </Section>
  );
}
