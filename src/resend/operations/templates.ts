import { z } from "zod";
import { getResendClient, validateScheduledTime } from "../common/utils.js";
import { SendEmailResponseSchema } from "../common/types.js";

// Schema definitions
export const SendEmailWithTemplateSchema = z.object({
  from: z.string().describe("Sender email address or formatted 'Name <email@example.com>'"),
  to: z.union([z.string(), z.array(z.string())]).describe("Recipient(s) of the email"),
  subject: z.string().describe("Email subject line"),
  reply_to: z.string().optional().describe("Reply-to email address"),
  template_id: z.string().describe("ID of the template to use"),
  data: z.record(z.any()).describe("Data to populate the template"),
  cc: z.union([z.string(), z.array(z.string())]).optional().describe("Carbon copy recipients"),
  bcc: z.union([z.string(), z.array(z.string())]).optional().describe("Blind carbon copy recipients"),
  attachments: z.array(
    z.object({
      filename: z.string(),
      content: z.string(),
    })
  ).optional().describe("Array of attachments"),
  tags: z.array(
    z.object({
      name: z.string(),
      value: z.string(),
    })
  ).optional().describe("Tags for tracking emails"),
  scheduled_at: z.string().optional().describe("ISO timestamp for scheduling the email delivery"),
});

// Function implementations
export async function sendEmailWithTemplate(params: z.infer<typeof SendEmailWithTemplateSchema>) {
  const resend = getResendClient();

  try {
    // Validate scheduled_at timestamp if provided
    const validatedScheduledAt = validateScheduledTime(params.scheduled_at);
    
    // Prepare the API payload
    const emailOptions: any = {
      from: params.from,
      to: params.to,
      subject: params.subject,
      reply_to: params.reply_to,
      cc: params.cc,
      bcc: params.bcc,
      attachments: params.attachments,
      tags: params.tags,
      scheduled_at: validatedScheduledAt,
    };

    // Add template information - checking docs, Resend might use different fields
    // depending on your template type (using any to bypass TypeScript checks)
    emailOptions.template = params.template_id;
    emailOptions.data = params.data;

    const { data, error } = await resend.emails.send(emailOptions);

    if (error) {
      throw new Error(`Failed to send email with template: ${error.message}`);
    }

    return SendEmailResponseSchema.parse(data);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Unexpected error: ${String(error)}`);
  }
} 