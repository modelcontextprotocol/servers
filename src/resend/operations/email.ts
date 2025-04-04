import { z } from "zod";
import { getResendClient, validateScheduledTime } from "../common/utils.js";
import {
  AttachmentSchema,
  ToRecipientsSchema,
  RecipientsArraySchema,
  EmailContentSchema,
  SendEmailResponseSchema,
} from "../common/types.js";

// Schema definitions
export const SendEmailSchema = z.object({
  from: z.string().describe("Sender email address or formatted 'Name <email@example.com>'"),
  to: ToRecipientsSchema.describe("Recipient(s) of the email"),
  subject: z.string().describe("Email subject line"),
  cc: RecipientsArraySchema.optional().describe("Carbon copy recipients"),
  bcc: RecipientsArraySchema.optional().describe("Blind carbon copy recipients"),
  reply_to: z.string().optional().describe("Reply-to email address"),
  html: z.string().optional().describe("HTML content of the email"),
  text: z.string().optional().describe("Plain text content of the email"),
  attachments: z.array(AttachmentSchema).optional().describe("Array of attachments"),
  tags: z.array(
    z.object({
      name: z.string(),
      value: z.string(),
    })
  ).optional().describe("Tags for tracking emails"),
  scheduled_at: z.string().optional().describe("ISO timestamp for scheduling the email delivery"),
});

// Function implementations
export async function sendEmail(params: z.infer<typeof SendEmailSchema>) {
  const resend = getResendClient();
  
  // Ensuring at least one content type is provided
  if (!params.html && !params.text) {
    throw new Error("Either html or text content must be provided");
  }

  // Convert complex recipient types to strings for the Resend API
  const formatRecipient = (recipient: string | { email: string; name?: string }): string => {
    if (typeof recipient === 'string') return recipient;
    return recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email;
  };

  try {
    // Validate scheduled_at timestamp if provided
    const validatedScheduledAt = validateScheduledTime(params.scheduled_at);
    
    // Prepare email options based on content type
    const emailOptions: any = {
      from: params.from,
      to: Array.isArray(params.to) 
        ? params.to.map(formatRecipient) 
        : [formatRecipient(params.to)],
      subject: params.subject,
      reply_to: params.reply_to,
      cc: params.cc?.map(formatRecipient),
      bcc: params.bcc?.map(formatRecipient),
      attachments: params.attachments,
      tags: params.tags,
      scheduled_at: validatedScheduledAt,
    };
    
    // Add content (html or text)
    if (params.html) {
      emailOptions.html = params.html;
    }
    if (params.text) {
      emailOptions.text = params.text;
    }

    const { data, error } = await resend.emails.send(emailOptions);

    if (error) {
      throw new Error(`Failed to send email: ${error.message}`);
    }

    return SendEmailResponseSchema.parse(data);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Unexpected error: ${String(error)}`);
  }
} 