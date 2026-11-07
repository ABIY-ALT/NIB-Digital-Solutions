import { describe, expect, it } from 'vitest';
import { ProductQuestion, type ProductQuestionInput } from './product-question.entity.js';

const valid: ProductQuestionInput = {
  reference: 'QST-261106-ABCDE',
  productSlug: 'school-management-system',
  customerName: 'Abebe Kebede',
  customerEmail: 'Abebe@Example.com',
  question: 'How can schools register and manage student payments?',
};

describe('ProductQuestion', () => {
  it('opens a question with a normalised e-mail', () => {
    const q = ProductQuestion.create(valid, null);
    expect(q.status).toBe('open');
    expect(q.customerEmail).toBe('abebe@example.com');
  });

  it('strips markup and requires a real question', () => {
    expect(
      ProductQuestion.create({ ...valid, question: 'Do you <b>support</b> USSD payments?' }, null)
        .question,
    ).not.toMatch(/[<>]/);
    expect(() => ProductQuestion.create({ ...valid, question: 'hi' }, null)).toThrow();
    expect(() => ProductQuestion.create({ ...valid, customerEmail: 'abebe' }, null)).toThrow();
  });

  it('follows the conversation: answers → answered, customer follow-ups → open', () => {
    const q = ProductQuestion.create(valid, null);
    q.recordMessage('developer', new Date(), null);
    expect(q.status).toBe('answered');
    q.recordMessage('customer', new Date(), null);
    expect(q.status).toBe('open');
  });

  it('accepts only the four statuses', () => {
    const q = ProductQuestion.create(valid, null);
    q.setStatus('in_progress', 'staff');
    q.setStatus('closed', 'staff');
    expect(q.closed).toBe(true);
    expect(() => q.setStatus('resolved', 'staff')).toThrow();
  });
});
