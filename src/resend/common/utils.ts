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