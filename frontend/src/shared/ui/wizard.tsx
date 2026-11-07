'use client';

import { Check } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  FormProvider,
  type FieldPath,
  type FieldValues,
  type UseFormReturn,
} from 'react-hook-form';
import { cn } from '@/shared/lib/cn';
import { Button } from './button';
import { applyServerError, FormRootError } from './form';

export interface WizardStep<T extends FieldValues> {
  id: string;
  title: string;
  description?: string;
  /** Fields validated before leaving this step. */
  fields?: FieldPath<T>[];
  content: ReactNode;
}

export interface WizardLabels {
  back: string;
  next: string;
  finish: string;
  stepOf: (current: number, total: number) => string;
}

/**
 * Multi-step form. One React Hook Form instance spans all steps; each step
 * validates only its own fields before moving on.
 */
export function Wizard<T extends FieldValues>({
  form,
  steps,
  onComplete,
  labels,
  className,
}: Readonly<{
  form: UseFormReturn<T>;
  steps: WizardStep<T>[];
  /** A returned promise is awaited. */
  onComplete: (values: T) => unknown;
  labels: WizardLabels;
  className?: string;
}>) {
  const [index, setIndex] = useState(0);
  const step = steps[index]!;
  const last = index === steps.length - 1;

  const next = async () => {
    const valid = step.fields?.length
      ? await form.trigger(step.fields, { shouldFocus: true })
      : true;
    if (valid) setIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  const submit = form.handleSubmit(async (values) => {
    try {
      await onComplete(values);
    } catch (error) {
      applyServerError(form, error);
    }
  });

  return (
    <FormProvider {...form}>
      <form
        // POST: before hydration a native GET would put the fields in the URL (see form.tsx).
        method="post"
        noValidate
        onSubmit={(e) => (last ? void submit(e) : (e.preventDefault(), void next()))}
        className={cn('space-y-6', className)}
      >
        <ol
          className="flex flex-wrap items-center gap-2"
          aria-label={labels.stepOf(index + 1, steps.length)}
        >
          {steps.map((s, i) => {
            const done = i < index;
            const current = i === index;
            return (
              <li
                key={s.id}
                className="flex items-center gap-2"
                aria-current={current ? 'step' : undefined}
              >
                <span
                  className={cn(
                    'flex size-7 items-center justify-center rounded-full border text-xs font-semibold',
                    done && 'border-primary bg-primary text-primary-foreground',
                    current && 'border-primary bg-primary-soft text-primary-text',
                    !done && !current && 'border-border-strong text-muted-foreground',
                  )}
                >
                  {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span
                  className={cn('text-sm', current ? 'font-semibold' : 'text-muted-foreground')}
                >
                  {s.title}
                </span>
                {i < steps.length - 1 ? (
                  <span className="mx-1 hidden h-px w-8 bg-border-strong sm:block" aria-hidden />
                ) : null}
              </li>
            );
          })}
        </ol>

        <section aria-labelledby={`wizard-${step.id}`} className="space-y-4">
          <div>
            <h3 id={`wizard-${step.id}`} className="text-base font-semibold">
              {step.title}
            </h3>
            {step.description ? (
              <p className="text-xs text-muted-foreground">{step.description}</p>
            ) : null}
          </div>
          {step.content}
        </section>

        <FormRootError />

        <div className="flex items-center justify-between border-t border-border pt-4">
          <span className="text-xs text-muted-foreground">
            {labels.stepOf(index + 1, steps.length)}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              {labels.back}
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {last ? labels.finish : labels.next}
            </Button>
          </div>
        </div>
      </form>
    </FormProvider>
  );
}
