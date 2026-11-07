'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { LayoutGrid } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApprovalNotice } from '@/features/approvals/components/approval-notice';
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
import { TextareaField } from '@/shared/ui/form-fields';
import { FormSurface } from '@/shared/ui/form-surface';
import { useSaveProductCategory } from '../hooks/use-product-categories';
import {
  productCategoryFormDefaults,
  productCategoryFormSchema,
  toProductCategoryInput,
  type ProductCategoryFormValues,
} from '../schemas';
import type { ProductCategory } from '../types';

type Values = ProductCategoryFormValues;

/**
 * Create / edit a product category (generated): a modal or side panel per app.config
 * ui.forms (form id "product-categories"). Server validation maps onto fields.
 */
export function ProductCategoryFormDialog({
  open,
  entity,
  onOpenChange,
}: {
  open: boolean;
  entity: ProductCategory | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('productCategories');
  return (
    <FormSurface
      id="product-categories"
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      icon={<LayoutGrid />}
      title={entity ? t('form.editTitle') : t('form.createTitle')}
    >
      {open ? <ProductCategoryForm entity={entity} onDone={() => onOpenChange(false)} /> : null}
    </FormSurface>
  );
}

function ProductCategoryForm({
  entity,
  onDone,
}: {
  entity: ProductCategory | null;
  onDone: () => void;
}) {
  const t = useTranslations('productCategories');
  const tc = useTranslations('common');
  const save = useSaveProductCategory();
  const feedback = useSaveFeedback();
  const [reason, setReason] = useState('');
  const form = useForm<Values>({
    resolver: zodResolver(productCategoryFormSchema(t)),
    defaultValues: productCategoryFormDefaults(entity),
  });

  return (
    <Form
      form={form}
      onSubmit={async (values) => {
        const input = toProductCategoryInput(values);
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
        <TextField<Values>
          name="code"
          label={t('fields.code')}
          required
          maxLength={160}
          autoFocus
        />
        <TextField<Values> name="name" label={t('fields.name')} required maxLength={160} />
        <TextareaField<Values>
          name="description"
          label={t('fields.description')}
          rows={3}
          className="col-span-full"
        />
        <TextField<Values> name="icon" label={t('fields.icon')} maxLength={160} />
        <TextField<Values> name="sortOrder" label={t('fields.sortOrder')} inputMode="numeric" />
      </FormGrid>
      <ApprovalNotice
        action={entity ? 'product-categories.update' : 'product-categories.create'}
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
