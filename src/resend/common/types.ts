import { z } from "zod";

// Basic types
export const EmailAddressSchema = z.string().email().describe("Valid email address");
export const AttachmentSchema = z.object({
  filename: z.string().describe("Filename of the attachment"),
  content: z.string().describe("Content of the attachment (base64 encoded)"),
  path: z.string().optional().describe("Optional path to the attachment file"),
  contentType: z.string().optional().describe("MIME type of the attachment"),
});

// Email recipient types
export const RecipientSchema = z.union([
  EmailAddressSchema,
  z.object({
    email: EmailAddressSchema,
    name: z.string().optional(),
  }),
]);

// CC and BCC recipients are always arrays
export const RecipientsArraySchema = z.array(RecipientSchema).describe("Array of email recipients");

// But 'to' can be a single recipient or an array
export const ToRecipientsSchema = z.union([
  RecipientSchema,
  RecipientsArraySchema,
]).describe("Email recipient(s)");

// Email content types
export const EmailContentSchema = z.object({
  html: z.string().optional().describe("HTML content of the email"),
  text: z.string().optional().describe("Plain text content of the email"),
  react: z.any().optional().describe("React component to render as email content"),
});

// Response type for sending an email
export const SendEmailResponseSchema = z.object({
  id: z.string().describe("ID of the sent email"),
});

// Type exports
export type Attachment = z.infer<typeof AttachmentSchema>;
export type Recipient = z.infer<typeof RecipientSchema>;
export type RecipientsArray = z.infer<typeof RecipientsArraySchema>;
export type ToRecipients = z.infer<typeof ToRecipientsSchema>;
export type EmailContent = z.infer<typeof EmailContentSchema>;
export type SendEmailResponse = z.infer<typeof SendEmailResponseSchema>; 