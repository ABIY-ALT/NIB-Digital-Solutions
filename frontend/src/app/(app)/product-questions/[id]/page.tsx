import type { Metadata } from 'next';
import { requireUser } from '@/features/auth/api/session';
import { QuestionDetail } from '@/features/product-questions/components/question-detail';

export const metadata: Metadata = { title: 'Product question' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireUser({ permission: 'product-questions:read' });
  const { id } = await params;
  return <QuestionDetail id={id} />;
}
