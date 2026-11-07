'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Handshake } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAllProductCategories } from '@/features/product-categories/hooks/use-product-categories';
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
import { SelectField, TextareaField } from '@/shared/ui/form-fields';
import { FormSurface } from '@/shared/ui/form-surface';
import { useSaveProductIdea } from '../hooks/use-product-ideas';
import {
  IDEA_STATUSES,
  productIdeaFormDefaults,
  productIdeaFormSchema,
  toProductIdeaInput,
  type ProductIdeaFormValues,
} from '../schemas';
import type { ProductIdea } from '../types';

type Values = ProductIdeaFormValues;

/**
 * Create / edit a product idea (generated): a modal or side panel per app.config
 * ui.forms (form id "product-ideas"). Server validation maps onto fields.
 */
export function ProductIdeaFormDialog({
  open,
  entity,
  onOpenChange,
}: {
  open: boolean;
  entity: ProductIdea | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('productIdeas');
  return (
    <FormSurface
      id="product-ideas"
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      icon={<Handshake />}
      title={entity ? t('form.editTitle') : t('form.createTitle')}
    >
      {open ? <ProductIdeaForm entity={entity} onDone={() => onOpenChange(false)} /> : null}
    </FormSurface>
  );
}

function ProductIdeaForm({ entity, onDone }: { entity: ProductIdea | null; onDone: () => void }) {
  const t = useTranslations('productIdeas');
  const tc = useTranslations('common');
  const save = useSaveProductIdea();
  const feedback = useSaveFeedback();
  const [reason, setReason] = useState('');
  const categories = useAllProductCategories();
  const form = useForm<Values>({
    resolver: zodResolver(productIdeaFormSchema(t)),
    defaultValues: productIdeaFormDefaults(entity),
  });

  return (
    <Form
      form={form}
      onSubmit={async (values) => {
        const input = toProductIdeaInput(values);
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
          name="title"
          label={t('fields.title')}
          required
          maxLength={160}
          autoFocus
          className="col-span-full"
        />
        <TextareaField<Values>
          name="problem"
          label={t('fields.problem')}
          required
          rows={4}
          className="col-span-full"
        />
        <SelectField<Values>
          name="status"
          label={t('fields.status')}
          required
          options={IDEA_STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) }))}
          description={t('hints.status')}
        />
        <SelectField<Values>
          name="categoryCode"
          label={t('fields.categoryCode')}
          options={[
            { value: '', label: t('noCategory') },
            ...(categories.data ?? []).map((c) => ({ value: c.code, label: c.name })),
          ]}
        />
        <TextField<Values> name="submitterName" label={t('fields.submitterName')} maxLength={120} />
        <TextField<Values>
          name="submitterEmail"
          label={t('fields.submitterEmail')}
          required
          maxLength={160}
        />
        <TextareaField<Values>
          name="adminNote"
          label={t('fields.adminNote')}
          description={t('hints.adminNote')}
          rows={3}
          className="col-span-full"
        />
      </FormGrid>
      <ApprovalNotice
        action={entity ? 'product-ideas.update' : 'product-ideas.create'}
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
