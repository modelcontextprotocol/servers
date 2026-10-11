// "Resource scopes" are opaque data/field-level permission labels — they are NOT MCP
// resources. The server uses them to filter which fields a tool returns at a given
// verification level; real MCP resources/list and resources/read are gated separately
// by verification level (see server.ts).
//
// End-user identity always travels in the request `_meta` under the extension key —
// never as a tool argument. The connector's OAuth token authenticates the *channel*
// and is broad (any user's data), so per-user authorization must come from the
// asserted `_meta` identity. A tool that took `userId` as an argument would be a
// confused-deputy: the caller could ask for anyone's data.

import { z } from "zod";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

export const EXTENSION_KEY =
  "io.modelcontextprotocol/delegated-end-user-context" as const;

export const SERVER_RESOURCE_URI = "acme-support.example.com";

export const ISSUER_NAME = "https://techcorp.example";
export const ISSUER_JWKS_URI = "https://techcorp.example/.well-known/jwks.json";

export const WELL_KNOWN_LEVELS = ["anonymous", "claimed", "verified"] as const;

export const SUPPORTED_SCHEMES = ["email", "oidc"] as const;

const NonEmpty = z.string().trim().min(1);

export const UserIdSchema = z
  .object({ scheme: NonEmpty, value: NonEmpty })
  .strict();

export const EndUserContextSchema = z
  .object({
    verificationLevel: NonEmpty.default("anonymous"),
    userId: UserIdSchema.optional(),
    verificationMethod: NonEmpty.optional(),
    verifiedAt: NonEmpty.optional(),
    assertion: NonEmpty.optional(),
  })
  .strict()
  .superRefine((ctx, zctx) => {
    // userId present iff verificationLevel !== "anonymous" (the only cross-field invariant)
    const hasUserId = ctx.userId !== undefined;
    const isAnonymous = ctx.verificationLevel === "anonymous";
    if (hasUserId === isAnonymous) {
      zctx.addIssue({
        code: "custom",
        message:
          "userId must be present iff verificationLevel is not 'anonymous'",
        path: hasUserId ? ["userId"] : ["verificationLevel"],
      });
    }
  });

export const ToolPolicySchema = z
  .object({ resourceScopes: z.array(NonEmpty) })
  .strict();

export const PolicySchema = z
  .object({ tools: z.record(z.string(), ToolPolicySchema) })
  .strict();

export const LevelsSchema = z.record(z.string(), PolicySchema);

export const DefaultPoliciesSchema = z
  .object({
    resourceScopes: z.record(z.string(), z.string()),
    levels: LevelsSchema,
  })
  .strict();

export const OverrideToolPolicySchema = z
  .object({
    enabled: z.boolean().optional(),
    resourceScopes: z.array(NonEmpty).optional(),
  })
  .strict();

export const PolicyOverridesSchema = z.record(
  z.string(),
  z
    .object({
      tools: z.record(z.string(), OverrideToolPolicySchema).optional(),
    })
    .strict()
);

const HttpsUrl = z
  .string()
  .trim()
  .min(1)
  .refine((val) => {
    try {
      const url = new URL(val);
      return url.protocol === "https:";
    } catch {
      return false;
    }
  }, "jwksUri must be an absolute HTTPS URL");

export const IssuerHintSchema = z
  .object({ name: NonEmpty, jwksUri: HttpsUrl })
  .strict();

export const ClientExtensionParamsSchema = z
  .object({
    issuer: IssuerHintSchema.optional(),
    policyOverrides: PolicyOverridesSchema.optional(),
  })
  .strict();

// No `issuer` field — the server does not declare an issuer; it consumes the client's.
export const ServerExtensionCapabilitiesSchema = z
  .object({
    userIdSchemes: z.array(z.string()),
    verificationLevels: z.array(z.string()),
    contextInListRequests: z.boolean(),
    assertionRequired: z.array(z.string()).optional(),
    defaultPolicies: DefaultPoliciesSchema,
    effectivePolicies: LevelsSchema,
  })
  .strict();

export type UserId = z.infer<typeof UserIdSchema>;
export type EndUserContext = z.infer<typeof EndUserContextSchema>;
export type ToolPolicy = z.infer<typeof ToolPolicySchema>;
export type Policy = z.infer<typeof PolicySchema>;
export type Levels = z.infer<typeof LevelsSchema>;
export type DefaultPolicies = z.infer<typeof DefaultPoliciesSchema>;
export type OverrideToolPolicy = z.infer<typeof OverrideToolPolicySchema>;
export type PolicyOverrides = z.infer<typeof PolicyOverridesSchema>;
export type IssuerHint = z.infer<typeof IssuerHintSchema>;
export type ClientExtensionParams = z.infer<typeof ClientExtensionParamsSchema>;
export type ServerExtensionCapabilities = z.infer<
  typeof ServerExtensionCapabilitiesSchema
>;

export const SearchKnowledgeBaseArgs = z.object({ query: NonEmpty }).strict();
export type SearchKnowledgeBaseArgs = z.infer<typeof SearchKnowledgeBaseArgs>;

export const LookupOrdersArgs = z
  .object({ orderIds: z.array(NonEmpty).optional() })
  .strict();
export type LookupOrdersArgs = z.infer<typeof LookupOrdersArgs>;

export const GetAccountDetailsArgs = z.object({}).strict();
export type GetAccountDetailsArgs = z.infer<typeof GetAccountDetailsArgs>;

export const InitiateReturnArgs = z.object({ orderId: NonEmpty }).strict();
export type InitiateReturnArgs = z.infer<typeof InitiateReturnArgs>;

export const TOOL_INPUT_SCHEMAS = {
  search_knowledge_base: SearchKnowledgeBaseArgs,
  lookup_orders: LookupOrdersArgs,
  get_account_details: GetAccountDetailsArgs,
  initiate_return: InitiateReturnArgs,
} as const;

// ── Error builders ───────────────────────────────────────────────────────────
//
// Two kinds of failure, and which one you use is not arbitrary:
//
// Protocol-shape / auth-layer problems → JSON-RPC errors (thrown as McpError).
//   -32001  Missing required end-user context (extension negotiated but _meta absent)
//   -32002  Invalid or expired assertion (missing/invalid/expired JWT; data.reason)
//   -32003  Unsupported user ID scheme (data.scheme + data.supportedSchemes)
//   -32602  Invalid params (standard JSON-RPC/MCP code): malformed _meta context,
//           malformed initialize extension params, malformed tool arguments,
//           unsupported verification level, or unknown/below-level resource URI.
//           data.reason distinguishes these; data.detail is safe (Zod issue paths +
//           messages, never raw values).
//
// Policy / authorization outcomes → tool results with isError: true (returned, not
// thrown; only valid for tools/call, the only method whose result carries content):
//   - tool not allowed at this verification level
//   - cross-user data access, or data not found for the caller (one generic,
//     non-leaking result so existence/ownership is never revealed)

export const AssertionFailureReason = {
  ASSERTION_MISSING: "assertion_missing",
  ASSERTION_EXPIRED: "assertion_expired",
  ASSERTION_INVALID: "assertion_invalid",
} as const;
export type AssertionFailureReason =
  (typeof AssertionFailureReason)[keyof typeof AssertionFailureReason];

export type MalformedReason =
  | "malformed_context"
  | "malformed_init_params"
  | "malformed_arguments"
  | "unsupported_verification_level"
  | "unknown_resource_uri";

export function missingContextError(): McpError {
  return new McpError(-32001, "Missing required end-user context", {
    extension: EXTENSION_KEY,
  });
}

export function invalidAssertionError(
  reason: AssertionFailureReason
): McpError {
  return new McpError(-32002, "Invalid or expired end-user assertion", {
    extension: EXTENSION_KEY,
    reason,
  });
}

export function unsupportedSchemeError(
  scheme: string,
  supportedSchemes: readonly string[]
): McpError {
  return new McpError(-32003, "Unsupported user ID scheme", {
    extension: EXTENSION_KEY,
    scheme,
    supportedSchemes: [...supportedSchemes],
  });
}

export function malformedParamsError(
  reason: MalformedReason,
  zodErrorOrDetail?: z.ZodError | string
): McpError {
  let detail: string | undefined;
  if (typeof zodErrorOrDetail === "string") {
    detail = zodErrorOrDetail;
  } else if (zodErrorOrDetail) {
    detail = zodErrorOrDetail.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
  }
  return new McpError(ErrorCode.InvalidParams, "Invalid params", {
    extension: EXTENSION_KEY,
    reason,
    detail,
  });
}

export function unsupportedLevelError(
  level: string,
  supportedLevels: string[]
): McpError {
  const base = malformedParamsError("unsupported_verification_level");
  const baseData = base.data as Record<string, unknown> | undefined;
  return new McpError(ErrorCode.InvalidParams, "Invalid params", {
    extension: EXTENSION_KEY,
    reason: "unsupported_verification_level",
    level,
    supportedLevels,
    ...(baseData?.detail ? { detail: baseData.detail } : {}),
  });
}

// Never log bearer credentials, even in a demo. redactContext returns a shallow
// copy with `assertion` masked so the JWT is never printed.
export function redactContext(
  ctx: EndUserContext | Record<string, unknown>
): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...(ctx as Record<string, unknown>) };
  if (copy.assertion !== undefined) {
    copy.assertion = "***REDACTED***";
  }
  return copy;
}
