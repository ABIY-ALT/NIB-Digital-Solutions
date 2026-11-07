import { describe, expect, it } from 'vitest';
import { ProductIdea, type ProductIdeaInput } from './product-idea.entity.js';

const valid: ProductIdeaInput = {
  reference: 'IDEA-261105-ABCDE',
  title: '  Pharmacy  stock & prescriptions ',
  problem: 'Small pharmacies track stock on paper and run out of essential medicines.',
  categoryCode: 'business-management',
  submitterName: 'Abebe Kebede',
  submitterEmail: 'Abebe@Example.com',
  status: 'submitted',
};

describe('ProductIdea', () => {
  it('normalises a submission', () => {
    const idea = ProductIdea.create(valid, null);
    expect(idea.title).toBe('Pharmacy stock & prescriptions');
    expect(idea.submitterEmail).toBe('abebe@example.com');
    expect(idea.titleKey).toBe('pharmacy stock prescriptions');
    expect(idea.voteCount).toBe(0);
    expect(idea.isPublic).toBe(false); // waits for moderation
  });

  it('strips markup from visitor text', () => {
    const idea = ProductIdea.create(
      {
        ...valid,
        title: '<b>Clinic</b> queue app',
        problem: 'Patients wait <script>x</script> for hours at clinics every day.',
      },
      null,
    );
    expect(idea.title).not.toMatch(/[<>]/);
    expect(idea.problem).not.toMatch(/[<>]/);
  });

  it('requires a meaningful title, problem and a valid e-mail', () => {
    expect(() => ProductIdea.create({ ...valid, title: 'ab' }, null)).toThrow();
    expect(() => ProductIdea.create({ ...valid, problem: 'too short' }, null)).toThrow();
    expect(() => ProductIdea.create({ ...valid, submitterEmail: 'nope' }, null)).toThrow();
    expect(() => ProductIdea.create({ ...valid, status: 'popular' }, null)).toThrow();
  });

  it('is public and votable once approved; completed ideas are public but closed to votes', () => {
    const idea = ProductIdea.create(valid, null);
    idea.update({ status: 'approved' }, 'staff');
    expect(idea.isPublic && idea.isVotable).toBe(true);
    idea.update({ status: 'completed' }, 'staff');
    expect(idea.isPublic).toBe(true);
    expect(idea.isVotable).toBe(false);
    idea.update({ status: 'rejected' }, 'staff');
    expect(idea.isPublic).toBe(false);
  });

  it('never lets staff edit the vote count by hand', () => {
    const idea = ProductIdea.create(valid, null);
    idea.update({ voteCount: 999 }, 'staff');
    expect(idea.voteCount).toBe(0);
  });
});
