import { z } from 'zod';
import { apiSchema } from '#core/presentation/openapi/api-schema.js';

/** Internal follow-up note on a demo request or inquiry (contract). */
export const LeadNoteSchema = apiSchema(
  'LeadNote',
  z.object({ id: z.string(), author: z.string(), body: z.string(), createdAt: z.string() }),
);
