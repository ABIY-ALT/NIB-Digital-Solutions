'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { UserCog } from 'lucide-react';
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
import { SwitchField } from '@/shared/ui/form-fields';
import { FormSurface } from '@/shared/ui/form-surface';
import { useSaveProductDeveloper } from '../hooks/use-product-developers';
import {
  productDeveloperFormDefaults,
  productDeveloperFormSchema,
  toProductDeveloperInput,
  type ProductDeveloperFormValues,
} from '../schemas';
import type { ProductDeveloper } from '../types';

type Values = ProductDeveloperFormValues;

/**
 * Create / edit a product developer (generated): a modal or side panel per app.config
 * ui.forms (form id "product-developers"). Server validation maps onto fields.
 */
export function ProductDeveloperFormDialog({
  open,
  entity,
  onOpenChange,
}: {
  open: boolean;
  entity: ProductDeveloper | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('productDevelopers');
  return (
    <FormSurface
      id="product-developers"
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      icon={<UserCog />}
      title={entity ? t('form.editTitle') : t('form.createTitle')}
    >
      {open ? <ProductDeveloperForm entity={entity} onDone={() => onOpenChange(false)} /> : null}
    </FormSurface>
  );
}

function ProductDeveloperForm({
  entity,
  onDone,
}: {
  entity: ProductDeveloper | null;
  onDone: () => void;
}) {
  const t = useTranslations('productDevelopers');
  const tc = useTranslations('common');
  const save = useSaveProductDeveloper();
  const feedback = useSaveFeedback();
  const [reason, setReason] = useState('');
  const form = useForm<Values>({
    resolver: zodResolver(productDeveloperFormSchema(t)),
    defaultValues: productDeveloperFormDefaults(entity),
  });

  return (
    <Form
      form={form}
      onSubmit={async (values) => {
        const input = toProductDeveloperInput(values);
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
          name="name"
          label={t('fields.name')}
          required
          maxLength={160}
          autoFocus
        />
        <TextField<Values>
          name="email"
          label={t('fields.email')}
          description={t('form.emailHint')}
          required
          maxLength={160}
        />
        <TextField<Values>
          name="telegramUsername"
          label={t('fields.telegramUsername')}
          description={t('form.telegramUsernameHint')}
          placeholder="@username"
          maxLength={64}
          autoComplete="off"
        />
        <SwitchField<Values> name="active" label={t('fields.active')} />
      </FormGrid>
      <ApprovalNotice
        action={entity ? 'product-developers.update' : 'product-developers.create'}
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
