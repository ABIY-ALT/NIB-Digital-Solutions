'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApprovalNotice } from '@/features/approvals/components/approval-notice';
import { useAllDigitalProducts } from '@/features/digital-products/hooks/use-digital-products';
import { useSaveFeedback } from '@/shared/hooks/use-save-feedback';
import { Button } from '@/shared/ui/button';
import {
  Form,
  FormActions,
  FormGrid,
  FormRootError,
  SubmitButton,
  TextField,
} from '@/shared/ui/form';
import { SelectField, TextareaField } from '@/shared/ui/form-fields';
import { FormSurface } from '@/shared/ui/form-surface';
import { useSaveProductReview } from '../hooks/use-product-reviews';
import {
  RATINGS,
  REVIEW_STATUSES,
  productReviewFormDefaults,
  productReviewFormSchema,
  toProductReviewInput,
  type ProductReviewFormValues,
} from '../schemas';
import type { ProductReview } from '../types';

type Values = ProductReviewFormValues;

/**
 * Review a customer rating: approve or reject it and reply publicly. Staff can
 * also record a review they collected themselves (form id "product-reviews").
 */
export function ProductReviewFormDialog({
  open,
  entity,
  onOpenChange,
}: {
  open: boolean;
  entity: ProductReview | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('productReviews');
  return (
    <FormSurface
      id="product-reviews"
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      icon={<Star />}
      title={entity ? t('form.editTitle', { reference: entity.reference }) : t('form.createTitle')}
    >
      {open ? <ProductReviewForm entity={entity} onDone={() => onOpenChange(false)} /> : null}
    </FormSurface>
  );
}

function ProductReviewForm({
  entity,
  onDone,
}: {
  entity: ProductReview | null;
  onDone: () => void;
}) {
  const t = useTranslations('productReviews');
  const tc = useTranslations('common');
  const save = useSaveProductReview();
  const feedback = useSaveFeedback();
  const [reason, setReason] = useState('');
  const products = useAllDigitalProducts().data;
  const productOptions = useMemo(() => {
    const options = (products ?? [])
      .map((p) => ({ value: p.slug, label: p.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
    // Keep the current product selectable even if it was removed from the catalog.
    if (entity && !options.some((o) => o.value === entity.productSlug))
      options.unshift({ value: entity.productSlug, label: entity.productSlug });
    return options;
  }, [products, entity]);
  const form = useForm<Values>({
    resolver: zodResolver(productReviewFormSchema(t)),
    defaultValues: productReviewFormDefaults(entity),
  });

  return (
    <Form
      form={form}
      onSubmit={async (values) => {
        const input = toProductReviewInput(values);
        const result = await save.mutateAsync(
          entity
            ? { id: entity.id, input: { ...input, version: entity.version }, reason }
            : { input, reason },
        );
        feedback(result, entity ? t('toast.updated') : t('toast.created'));
        onDone();
      }}
    >
      <FormGrid columns={2}>
        <SelectField<Values>
          name="status"
          label={t('fields.status')}
          description={t('hints.status')}
          required
          options={REVIEW_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))}
        />
        <SelectField<Values>
          name="rating"
          label={t('fields.rating')}
          required
          options={RATINGS.map((r) => ({ value: r, label: t('stars', { count: Number(r) }) }))}
        />
        <SelectField<Values>
          name="productSlug"
          label={t('fields.productSlug')}
          required
          className="col-span-full"
          options={productOptions}
        />
        <TextField<Values>
          name="title"
          label={t('fields.title')}
          maxLength={160}
          className="col-span-full"
        />
        <TextareaField<Values>
          name="body"
          label={t('fields.body')}
          required
          rows={4}
          className="col-span-full"
        />
        <TextField<Values>
          name="reviewerName"
          label={t('fields.reviewerName')}
          required
          maxLength={160}
        />
        <TextField<Values> name="reviewerRole" label={t('fields.reviewerRole')} maxLength={160} />
        <TextField<Values>
          name="reviewerEmail"
          label={t('fields.reviewerEmail')}
          description={t('hints.email')}
          type="email"
          required
          maxLength={160}
          className="col-span-full"
        />
        <TextareaField<Values>
          name="reply"
          label={t('fields.reply')}
          description={t('hints.reply')}
          rows={3}
          className="col-span-full"
        />
      </FormGrid>
      <ApprovalNotice
        action={entity ? 'product-reviews.update' : 'product-reviews.create'}
        reason={reason}
        onReasonChange={setReason}
      />
      <FormRootError referenceLabel={tc('reference')} />
      <FormActions>
        <Button type="button" variant="outline" onClick={onDone}>
          {tc('cancel')}
        </Button>
        <SubmitButton>{entity ? tc('save') : t('form.create')}</SubmitButton>
      </FormActions>
    </Form>
  );
}
