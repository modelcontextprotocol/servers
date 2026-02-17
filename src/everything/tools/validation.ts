import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Tool input schema
const ValidationSchema = z.object({
  operation: z.enum(["email", "url", "phone", "json", "regex"]).describe("Validation operation to perform"),
  value: z.string().describe("Value to validate"),
  pattern: z.string().optional().describe("Regex pattern (for regex validation)"),
  flags: z.string().optional().describe("Regex flags (e.g., 'i' for case-insensitive)"),
});

// Tool configuration
const name = "validation";
const config = {
  title: "Data Validation Tool",
  description: "Validate data formats including email, URL, phone, JSON, and custom regex patterns",
  inputSchema: ValidationSchema,
};

/**
 * Registers the 'validation' tool.
 *
 * The registered tool provides various validation operations:
 * - email: Validate email format
 * - url: Validate URL format
 * - phone: Validate phone number format
 * - json: Validate JSON format
 * - regex: Validate against custom regex pattern
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerValidationTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const validatedArgs = ValidationSchema.parse(args);
    let result: { valid: boolean; message?: string; details?: any };

    switch (validatedArgs.operation) {
      case "email":
        result = validateEmail(validatedArgs.value);
        break;
      case "url":
        result = validateUrl(validatedArgs.value);
        break;
      case "phone":
        result = validatePhone(validatedArgs.value);
        break;
      case "json":
        result = validateJson(validatedArgs.value);
        break;
      case "regex":
        if (!validatedArgs.pattern) throw new Error("Pattern is required for regex validation");
        result = validateRegex(validatedArgs.value, validatedArgs.pattern, validatedArgs.flags);
        break;
      default:
        throw new Error(`Unknown operation: ${validatedArgs.operation}`);
    }

    return {
      content: [
        {
          type: "text",
          text: `Validation '${validatedArgs.operation}' result: ${JSON.stringify(result, null, 2)}`,
        },
      ],
    };
  });
};

// Helper functions
function validateEmail(email: string): { valid: boolean; message?: string } {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isValid = emailRegex.test(email);
  
  return {
    valid: isValid,
    message: isValid ? "Valid email format" : "Invalid email format"
  };
}

function validateUrl(url: string): { valid: boolean; message?: string; details?: any } {
  try {
    const urlObj = new URL(url);
    return {
      valid: true,
      message: "Valid URL format",
      details: {
        protocol: urlObj.protocol,
        hostname: urlObj.hostname,
        port: urlObj.port,
        pathname: urlObj.pathname
      }
    };
  } catch (error) {
    return {
      valid: false,
      message: "Invalid URL format"
    };
  }
}

function validatePhone(phone: string): { valid: boolean; message?: string; details?: any } {
  // Remove common formatting characters
  const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
  
  // Support multiple phone formats
  const phonePatterns = [
    /^\+?1?\d{10}$/, // US format (10 or 11 digits with optional +1)
    /^\+?\d{1,3}?[-.\s]?\(?\d{1,4}?\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}$/, // International format
    /^\d{10,15}$/ // Simple digit-only format (10-15 digits)
  ];
  
  const isValid = phonePatterns.some(pattern => pattern.test(cleanPhone));
  
  return {
    valid: isValid,
    message: isValid ? "Valid phone format" : "Invalid phone format",
    details: {
      original: phone,
      cleaned: cleanPhone,
      length: cleanPhone.length
    }
  };
}

function validateJson(jsonString: string): { valid: boolean; message?: string; details?: any } {
  try {
    const parsed = JSON.parse(jsonString);
    return {
      valid: true,
      message: "Valid JSON format",
      details: {
        type: Array.isArray(parsed) ? "array" : typeof parsed,
        keys: typeof parsed === 'object' && parsed !== null ? Object.keys(parsed) : null,
        size: JSON.stringify(parsed).length
      }
    };
  } catch (error) {
    return {
      valid: false,
      message: `Invalid JSON format: ${(error as Error).message}`
    };
  }
}

function validateRegex(value: string, pattern: string, flags?: string): { valid: boolean; message?: string; details?: any } {
  try {
    const regex = new RegExp(pattern, flags);
    const matches = value.match(regex);
    
    return {
      valid: regex.test(value),
      message: regex.test(value) ? "Value matches pattern" : "Value does not match pattern",
      details: {
        pattern: pattern,
        flags: flags || '',
        matches: matches || [],
        matchCount: matches ? matches.length : 0
      }
    };
  } catch (error) {
    return {
      valid: false,
      message: `Invalid regex pattern: ${(error as Error).message}`
    };
  }
}
