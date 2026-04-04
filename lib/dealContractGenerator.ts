import type { DealRecord } from "./deals";
import type { ContractTemplateRecord } from "./contractTemplates";
import { docusealFetch, docusealPost } from "./docuseal/client";
import { DocuSealTemplateSchema } from "./docuseal/schemas";
import { parseServiceCategory } from "./serviceCategory";
import { z } from "zod";

// The submission creation response includes the submitters array with embed_src
const CreateSubmissionResponseSchema = z.array(
  z.object({
    id: z.number(),
    submission_id: z.number(),
    uuid: z.string().optional(),
    email: z.string(),
    slug: z.string().optional(),
    status: z.string(),
    role: z.string(),
    embed_src: z.string().nullable().optional(),
  }).passthrough()
);

/**
 * Generate a DocuSeal contract submission from a closed deal.
 * Sends the contract to the client's email for signing.
 * Fetches the template to determine the correct submitter role name.
 */
export async function generateContractFromDeal(
  deal: DealRecord,
  clientEmail: string,
  templateRecord: ContractTemplateRecord
): Promise<{ submissionId: number; submitterId: number; signingUrl: string }> {
  const services = parseServiceCategory(deal.serviceCategory);
  const dealValueDollars = (deal.dealValue / 100).toFixed(2);

  // Fetch the template to get the actual submitter roles
  const template = await docusealFetch(
    `/templates/${templateRecord.docusealTemplateId}`,
    DocuSealTemplateSchema,
    { retries: 1 }
  );

  // Determine the client-facing role from the template's submitters
  const rawSubmitters = Array.isArray(template.submitters) ? template.submitters : [];
  if (rawSubmitters.length === 0) {
    throw new Error(`Template ${templateRecord.docusealTemplateId} has no submitter roles defined`);
  }
  if (rawSubmitters.length > 1) {
    console.warn(`[dealContractGenerator] Template ${templateRecord.docusealTemplateId} has ${rawSubmitters.length} submitter roles — only the first role will receive the signing request`);
  }
  const clientRole = (rawSubmitters[0] as { name?: string } | undefined)?.name || "First Party";

  // Get template field names so we only pre-fill fields that actually exist
  const rawFields = Array.isArray(template.fields) ? template.fields : [];
  const templateFields = rawFields as Array<{ name?: string; type?: string }>;
  const fieldNames = new Set(templateFields.map((f) => f.name?.toLowerCase()).filter(Boolean));

  // Map of possible field names → values (case-insensitive matching)
  const fieldValues: Record<string, string> = {
    "client name": deal.clientName,
    "client email": clientEmail,
    "name": deal.clientName,
    "email": clientEmail,
    "full name": deal.clientName,
    "deal value": `$${dealValueDollars}`,
    "amount": `$${dealValueDollars}`,
    "value": `$${dealValueDollars}`,
    "services": services.join(", ") || "Professional Services",
    "service": services.join(", ") || "Professional Services",
    "date": new Date().toISOString().slice(0, 10),
    "start date": new Date().toISOString().slice(0, 10),
    "contract date": new Date().toISOString().slice(0, 10),
  };

  // Only include fields that exist in the template
  const fields: Array<{ name: string; default_value: string; readonly?: boolean }> = [];
  for (const tf of templateFields) {
    const name = tf.name;
    if (!name) continue;
    const value = fieldValues[name.toLowerCase()];
    if (value) {
      fields.push({ name, default_value: value, readonly: true });
    }
  }

  const submitters = await docusealPost(
    "/submissions",
    {
      template_id: templateRecord.docusealTemplateId,
      send_email: true,
      submitters: [
        {
          email: clientEmail,
          role: clientRole,
          ...(fields.length > 0 ? { fields } : {}),
        },
      ],
      message: {
        subject: "Contract for Your Review & Signature — Agency Collective",
        body: "Hi {{submitter.name}},\n\nPlease review and sign the attached contract at your earliest convenience.\n\nSigning link: {{submitter.link}}\n\nThank you for choosing Agency Collective!",
      },
    },
    CreateSubmissionResponseSchema
  );

  const submitter = submitters[0];
  if (!submitter) {
    throw new Error("DocuSeal returned no submitters");
  }

  // Prefer embed_src (for embedded signing), then construct from slug
  let signingUrl = submitter.embed_src;
  if (!signingUrl && submitter.slug) {
    signingUrl = `https://docuseal.com/s/${submitter.slug}`;
  }
  if (!signingUrl) {
    throw new Error(`DocuSeal returned no signing URL for submitter ${submitter.id}`);
  }

  return {
    submissionId: submitter.submission_id,
    submitterId: submitter.id,
    signingUrl,
  };
}
