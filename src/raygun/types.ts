import { z } from "zod";

// Application schemas
export const ApplicationSchema = z.object({
  identifier: z.string(),
  planIdentifier: z.string(),
  name: z.string(),
  apiKey: z.string()
});

// Configuration schema
export const ConfigSchema = z.object({
  baseUrl: z.string().url().default("https://api.raygun.com/v3"),
  apiKey: z.string().min(1),
});


// Customer schema
export const CustomerSchema = z.object({
  identifier: z.string(),
  applicationIdentifier: z.string(),
  externalIdentifier: z.string().optional(),
  emailAddress: z.string().email().optional(),
  firstName: z.string().optional(),
  fullName: z.string().optional(),
  isAnonymous: z.boolean(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string()
});

// Deployment schema
export const DeploymentSchema = z.object({
  identifier: z.string(),
  applicationIdentifier: z.string(),
  version: z.string(),
  emailAddress: z.string().email().optional(),
  ownerName: z.string().optional(),
  comment: z.string().optional(),
  scmIdentifier: z.string().optional(),
  scmType: z.enum(['gitHub', 'bitbucket', 'gitLab', 'azureDevOps']).optional(),
  deployedAt: z.string(),
  applicationUrl: z.string().url().optional()
});

// Error group schema
export const ErrorGroupSchema = z.object({
  identifier: z.string(),
  applicationIdentifier: z.string(),
  message: z.string(),
  status: z.enum(['active', 'resolved', 'ignored', 'permanentlyIgnored']),
  lastOccurredAt: z.string(),
  createdAt: z.string(),
  resolvedIn: z.object({
    version: z.string(),
    discardFromPreviousVersions: z.boolean()
  }).optional(),
  discardNewOccurrences: z.boolean().optional(),
  applicationUrl: z.string().url().optional()
});


// Invitation schema
export const InvitationSchema = z.object({
  identifier: z.string(),
  teamIdentifier: z.string().optional(),
  emailAddress: z.string().email(),
  status: z.enum(['sent', 'accepted', 'revoked']),
  createdAt: z.string().datetime(),
  createdByUserIdentifier: z.string(),
  acceptedByUserIdentifier: z.string().optional()
});


// Metrics schemas
export const TimeSeriesMetricsSchema = z.array(z.object({
  aggregation: z.string(),
  metric: z.string(),
  series: z.array(z.object({
    time: z.string().datetime(),
    value: z.number()
  }))
}));

export const HistogramBucketSchema = z.object({
  key: z.number(),
  range: z.string(),
  count: z.number()
});

export const HistogramMetricsSchema = z.array(z.object({
  metric: z.string(),
  buckets: z.array(HistogramBucketSchema)
}));

// Page schemas
export const BasePageSchema = z.object({
  identifier: z.string(),
  applicationIdentifier: z.string(),
  lastSeenAt: z.string().datetime()
});

export const WebPageSchema = BasePageSchema.extend({
  type: z.literal('web'),  // Specify the literal type value
  uri: z.string().url()
});

export const MobilePageSchema = BasePageSchema.extend({
  type: z.literal('mobile'),  // Specify the literal type value
  name: z.string()
});

export const PageSchema = z.discriminatedUnion('type', [
  WebPageSchema,
  MobilePageSchema
]);

// Session schemas
export const SessionPageViewSchema = z.object({
  pageIdentifier: z.string(),
  viewedAt: z.string().datetime(),
  applicationUrl: z.string().url().describe("URL to view the session page view in Raygun")
});

export const SessionErrorSchema = z.object({
  errorGroupIdentifier: z.string(),
  occurredAt: z.string().datetime(),
  applicationUrl: z.string().url().describe("URL to view the error instance in Raygun")
});

export const SessionSchema = z.object({
  identifier: z.string(),
  applicationIdentifier: z.string(),
  customerIdentifier: z.string(),
  isActive: z.boolean(),
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  ipAddress: z.string(),
  countryCode: z.string().length(2).nullable(),
  platformName: z.string(),
  operatingSystemName: z.string(),
  operatingSystemVersion: z.string().nullable(),
  browserName: z.string(),
  browserVersion: z.string().nullable(),
  viewportWidth: z.number(),
  viewportHeight: z.number(),
  deploymentVersion: z.string().nullable(),
  applicationUrl: z.string().url().describe("URL to view the session in Raygun"),
  pageViews: z.array(SessionPageViewSchema).optional(),
  errors: z.array(SessionErrorSchema).optional()
});

// Source map schema
export const SourceMapSchema = z.object({
  identifier: z.string(),
  applicationIdentifier: z.string(),
  uri: z.string().url(),
  fileName: z.string(),
  fileSizeBytes: z.number(),
  uploadedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  isMapFile: z.boolean()
});

export type Application = z.infer<typeof ApplicationSchema>;
export type Customer = z.infer<typeof CustomerSchema>;
export type Deployment = z.infer<typeof DeploymentSchema>;
export type ErrorGroup = z.infer<typeof ErrorGroupSchema>;
export type Invitation = z.infer<typeof InvitationSchema>;
export type TimeSeriesMetrics = z.infer<typeof TimeSeriesMetricsSchema>;
export type HistogramMetrics = z.infer<typeof HistogramMetricsSchema>;
export type Page = z.infer<typeof PageSchema>;
export type SessionPageView = z.infer<typeof SessionPageViewSchema>;
export type SessionError = z.infer<typeof SessionErrorSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type SourceMap = z.infer<typeof SourceMapSchema>;

export type Config = z.infer<typeof ConfigSchema>;
export type ToolHandler<T> = (args: T) => Promise<any>;

