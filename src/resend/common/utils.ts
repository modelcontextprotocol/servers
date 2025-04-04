import { Resend } from 'resend';
import { createResendError } from './errors.js';
import { VERSION } from './version.js';

let resendClient: Resend | null = null;

export function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY environment variable is not set");
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

export function validateEmail(email: string): boolean {
  // Simple regex for email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validateAndFormatEmail(email: string, name?: string): string {
  if (!validateEmail(email)) {
    throw new Error(`Invalid email address: ${email}`);
  }
  
  if (name) {
    // Remove any special characters from the name to prevent injection
    const sanitizedName = name.replace(/["<>]/g, '');
    return `${sanitizedName} <${email}>`;
  }
  
  return email;
}

export function validateScheduledTime(timestamp: string | undefined): string | undefined {
  if (!timestamp) {
    return undefined;
  }

  const scheduledDate = new Date(timestamp);
  
  // Check if date is valid
  if (isNaN(scheduledDate.getTime())) {
    throw new Error(`Invalid scheduled_at timestamp: ${timestamp}. Use ISO 8601 format (e.g., "2023-12-31T23:59:59Z").`);
  }
  
  // Check if date is in the future (with a small buffer for processing)
  const now = new Date();
  const minSchedulingTime = new Date(now.getTime() + 60000); // 1 minute in the future
  
  if (scheduledDate < minSchedulingTime) {
    throw new Error(`Scheduled time must be at least 1 minute in the future.`);
  }
  
  return timestamp;
} 