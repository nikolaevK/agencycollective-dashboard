import { z } from "zod";

// --- Submitter ---

export const DocuSealSubmitterSchema = z.object({
  id: z.number(),
  submission_id: z.number(),
  uuid: z.string().optional(),
  email: z.string(),
  slug: z.string().optional(),
  sent_at: z.string().nullable().optional(),
  opened_at: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
  declined_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  name: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  status: z.enum(["pending", "sent", "opened", "completed", "declined"]),
  role: z.string(),
  embed_src: z.string().nullable().optional(),
  preferences: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
  values: z.array(z.record(z.unknown())).optional(),
  documents: z
    .array(
      z.object({
        name: z.string().optional(),
        url: z.string().optional(),
      }).passthrough()
    )
    .optional(),
}).passthrough();

export type DocuSealSubmitter = z.infer<typeof DocuSealSubmitterSchema>;

// --- Submission ---

export const DocuSealSubmissionSchema = z.object({
  id: z.number(),
  source: z.string().optional(),
  submitters_order: z.string().optional(),
  slug: z.string().optional(),
  audit_log_url: z.string().nullable().optional(),
  combined_document_url: z.string().nullable().optional(),
  expire_at: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  archived_at: z.string().nullable().optional(),
  status: z.enum(["pending", "completed", "expired"]).optional(),
  template: z
    .object({
      id: z.number(),
      name: z.string(),
    })
    .passthrough()
    .optional(),
  submitters: z.array(DocuSealSubmitterSchema).optional(),
  submission_events: z.array(z.record(z.unknown())).optional(),
}).passthrough();

export type DocuSealSubmission = z.infer<typeof DocuSealSubmissionSchema>;

// --- Template ---

export const DocuSealTemplateSchema = z.object({
  id: z.number(),
  slug: z.string().optional(),
  name: z.string(),
  schema: z.array(z.record(z.unknown())).optional(),
  fields: z.array(z.record(z.unknown())).optional(),
  submitters: z.array(z.record(z.unknown())).optional(),
  author_id: z.number().optional(),
  archived_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  source: z.string().optional(),
  folder_name: z.string().nullable().optional(),
  external_id: z.string().nullable().optional(),
}).passthrough();

export type DocuSealTemplate = z.infer<typeof DocuSealTemplateSchema>;

// --- Template list response (array) ---

export const DocuSealTemplateListSchema = z.object({
  data: z.array(DocuSealTemplateSchema),
  pagination: z
    .object({
      count: z.number(),
      next: z.number().nullable().optional(),
      prev: z.number().nullable().optional(),
    })
    .optional(),
}).passthrough();

// --- Submission list response ---

export const DocuSealSubmissionListSchema = z.object({
  data: z.array(DocuSealSubmissionSchema),
  pagination: z
    .object({
      count: z.number(),
      next: z.number().nullable().optional(),
      prev: z.number().nullable().optional(),
    })
    .optional(),
}).passthrough();

// --- Webhook event ---

export const DocuSealWebhookEventSchema = z.object({
  event_type: z.string(),
  timestamp: z.string(),
  data: z.record(z.unknown()),
}).passthrough();

export type DocuSealWebhookEvent = z.infer<typeof DocuSealWebhookEventSchema>;
