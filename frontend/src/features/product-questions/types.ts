import type { ApiSchemas } from '@/shared/api';

/** Product question as returned by the API (shared contract, generated from the backend). */
export type ProductQuestion = ApiSchemas['ProductQuestion'];
export type QuestionStatus = ProductQuestion['status'];
/** Conversation, routed developers and delivery log (staff view). */
export type QuestionConversation = ApiSchemas['ProductQuestionConversation'];

/** Update body: staff change the status only (customer text is never edited). */
export interface ProductQuestionInput {
  status?: QuestionStatus;
  version?: number;
}
