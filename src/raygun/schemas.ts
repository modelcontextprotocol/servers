import { z } from "zod";

// Common schema fragments that are reused
const PaginationSchema = {
    count: z.number().optional().describe("Limits the number of items in the response"),
    offset: z.number().optional().describe("Number of items to skip before returning results"),
};

const ApplicationOrderByEnum = z.enum(["name", "name desc", "apikey", "apikey desc"]);
const CustomerOrderByEnum = z.enum([
    'isAnonymous', 'isAnonymous desc',
    'firstSeenAt', 'firstSeenAt desc',
    'lastSeenAt', 'lastSeenAt desc'
]);
const DeploymentOrderByEnum = z.enum([
    'version', 'version desc',
    'emailAddress', 'emailAddress desc',
    'ownerName', 'ownerName desc',
    'comment', 'comment desc',
    'deployedAt', 'deployedAt desc'
]);
const ErrorGroupOrderByEnum = z.enum([
    'message', 'message desc',
    'status', 'status desc',
    'lastOccurredAt', 'lastOccurredAt desc',
    'createdAt', 'createdAt desc'
]);
const PageOrderByEnum = z.enum([
    'lastSeenAt', 'lastSeenAt desc',
    'uri', 'uri desc',
    'name', 'name desc'
]);
const SessionOrderByEnum = z.enum([
    'customerIdentifier', 'customerIdentifier desc',
    'startedAt', 'startedAt desc',
    'updatedAt', 'updatedAt desc',
    'endedAt', 'endedAt desc',
    'countryCode', 'countryCode desc',
    'platformName', 'platformName desc',
    'operatingSystemName', 'operatingSystemName desc',
    'operatingSystemVersion', 'operatingSystemVersion desc',
    'browserName', 'browserName desc',
    'browserVersion', 'browserVersion desc',
    'viewportWidth', 'viewportWidth desc',
    'viewportHeight', 'viewportHeight desc',
    'deploymentVersion', 'deploymentVersion desc'
]);
const SourceMapOrderByEnum = z.enum([
    'uri', 'uri desc',
    'fileName', 'fileName desc',
    'fileSizeBytes', 'fileSizeBytes desc',
    'uploadedAt', 'uploadedAt desc',
    'createdAt', 'createdAt desc',
    'updatedAt', 'updatedAt desc'
]);

// Application Schemas
export const ListApplicationsSchema = z.object({
    ...PaginationSchema,
    orderBy: ApplicationOrderByEnum.array().optional().describe("Order items by property values"),
});

export const GetApplicationSchema = z.object({
    applicationIdentifier: z.string().describe("Application identifier")
});

export const GetApplicationByApiKeySchema = z.object({
    apiKey: z.string().describe("Application api key")
});

export const RegenerateApplicationApiKeySchema = z.object({
    applicationIdentifier: z.string().describe("Application identifier")
});

// Customer Schemas
export const ListCustomersSchema = z.object({
    ...PaginationSchema,
    applicationIdentifier: z.string(),
    orderBy: CustomerOrderByEnum.array().optional().describe("Order items by property values"),
});

// Deployment Schemas
export const ListDeploymentsSchema = z.object({
    ...PaginationSchema,
    applicationIdentifier: z.string(),
    orderBy: DeploymentOrderByEnum.array().optional().describe("Order items by property values"),
});

export const GetDeploymentSchema = z.object({
    applicationIdentifier: z.string().describe("Application identifier"),
    deploymentIdentifier: z.string().describe("Deployment identifier")
});

export const DeleteDeploymentSchema = z.object({
    applicationIdentifier: z.string().describe("Application identifier"),
    deploymentIdentifier: z.string().describe("Deployment identifier")
});

export const UpdateDeploymentSchema = z.object({
    applicationIdentifier: z.string().describe("Application identifier"),
    deploymentIdentifier: z.string().describe("Deployment identifier"),
    version: z.string().min(1).max(128).optional(),
    ownerName: z.string().max(128).optional(),
    emailAddress: z.string().email().max(128).optional(),
    comment: z.string().optional(),
    scmIdentifier: z.string().max(256).optional(),
    scmType: z.enum(['gitHub', 'gitLab', 'azureDevOps', 'bitbucket']).optional(),
    deployedAt: z.string().datetime().optional()
});

export const ReprocessDeploymentCommitsSchema = z.object({
    applicationIdentifier: z.string().describe("Application identifier"),
    deploymentIdentifier: z.string().describe("Deployment identifier")
});

// Error Group Schemas
export const ListErrorGroupsSchema = z.object({
    ...PaginationSchema,
    applicationIdentifier: z.string(),
    orderBy: ErrorGroupOrderByEnum.array().optional().describe("Order items by property values"),
});

export const GetErrorGroupSchema = z.object({
    applicationIdentifier: z.string().describe("Application identifier"),
    errorGroupIdentifier: z.string().describe("Error group identifier")
});

export const ResolveErrorGroupSchema = z.object({
    applicationIdentifier: z.string().describe("Application identifier"),
    errorGroupIdentifier: z.string().describe("Error group identifier"),
    version: z.string().describe("The version that this error was resolved in"),
    discardFromPreviousVersions: z.boolean().default(true)
        .describe("When true, occurrences from previous versions will be discarded")
});

export const ActivateErrorGroupSchema = z.object({
    applicationIdentifier: z.string().describe("Application identifier"),
    errorGroupIdentifier: z.string().describe("Error group identifier")
});

export const IgnoreErrorGroupSchema = z.object({
    applicationIdentifier: z.string().describe("Application identifier"),
    errorGroupIdentifier: z.string().describe("Error group identifier")
});

export const PermanentlyIgnoreErrorGroupSchema = z.object({
    applicationIdentifier: z.string().describe("Application identifier"),
    errorGroupIdentifier: z.string().describe("Error group identifier"),
    discardNewOccurrences: z.boolean()
        .describe("When true, new occurrences of this error will not be stored or count towards your error quota")
});

// Page Schemas
export const ListPagesSchema = z.object({
    ...PaginationSchema,
    applicationIdentifier: z.string(),
    orderBy: PageOrderByEnum.array().optional().describe("Order items by property values"),
});

// Metrics Schemas
export const PageMetricsTimeSeriesSchema = z.object({
    applicationIdentifier: z.string(),
    start: z.string().datetime(),
    end: z.string().datetime(),
    granularity: z.string().regex(/^\d+[mhd]$/).describe("Time granularity in format like '1h', '30m', '1d'"),
    aggregation: z.enum(['count', 'average', 'median', 'sum', 'min', 'max', 'p95', 'p99']),
    metrics: z.enum([
        'pageViews', 'loadTime', 'firstPaint', 'firstContentfulPaint',
        'firstInputDelay', 'largestContentfulPaint', 'cumulativeLayoutShift',
        'interactionToNextPaint'
    ]).array(),
    filter: z.string().optional()
        .describe("Case-sensitive filter in the format 'pageIdentifier = abc123' or 'pageIdentifier IN (abc123, def456)'")
});

export const PageMetricsHistogramSchema = z.object({
    applicationIdentifier: z.string(),
    start: z.string().datetime(),
    end: z.string().datetime(),
    metrics: z.enum([
        'loadTime', 'firstPaint', 'firstContentfulPaint', 'firstInputDelay',
        'largestContentfulPaint', 'cumulativeLayoutShift', 'interactionToNextPaint'
    ]).array(),
    filter: z.string().optional()
        .describe("Case-sensitive filter in the format 'pageIdentifier = abc123' or 'pageIdentifier IN (abc123, def456)'")
});

export const ErrorMetricsTimeSeriesSchema = z.object({
    applicationIdentifier: z.string(),
    start: z.string().datetime(),
    end: z.string().datetime(),
    granularity: z.string().regex(/^\d+[mhd]$/).describe("Time granularity in format like '1h', '30m', '1d'"),
    aggregation: z.literal('count'),
    metrics: z.literal('errorInstances').array(),
    filter: z.string().optional()
        .describe("Case-sensitive filter in the format 'errorGroupIdentifier = abc123' or 'errorGroupIdentifier IN (abc123, def456)'")
});

// Session Schemas
export const ListSessionsSchema = z.object({
    ...PaginationSchema,
    applicationIdentifier: z.string(),
    filter: z.string().optional()
        .describe("Filter items by an expression. Currently only supports filtering by `xhr.uri`. Example: xhr.uri eq https://example.com"),
    orderBy: SessionOrderByEnum.array().optional().describe("Order items by property values"),
});

export const GetSessionSchema = z.object({
    applicationIdentifier: z.string(),
    sessionIdentifier: z.string(),
    include: z.enum(['pageViews', 'errors']).array().optional()
        .describe("Include additional information for the session")
});

// Invitation Schemas
export const ListInvitationsSchema = z.object({
    ...PaginationSchema,
    orderBy: z.enum([
        'emailAddress', 'emailAddress desc',
        'createdAt', 'createdAt desc'
    ]).array().optional().describe("Order items by property values")
});

export const SendInvitationSchema = z.object({
    emailAddress: z.string().email().describe("Email address to send the invitation to")
});

export const GetInvitationSchema = z.object({
    invitationIdentifier: z.string().describe("Invitation identifier")
});

export const RevokeInvitationSchema = z.object({
    invitationIdentifier: z.string().describe("Invitation identifier")
});

// Source Map Schemas
export const ListSourceMapsSchema = z.object({
    ...PaginationSchema,
    applicationIdentifier: z.string().describe("Application identifier"),
    orderBy: SourceMapOrderByEnum.array().optional().describe("Order items by property values")
});

export const GetSourceMapSchema = z.object({
    applicationIdentifier: z.string().describe("Application identifier"),
    sourceMapIdentifier: z.string().describe("Source map identifier")
});

export const UpdateSourceMapSchema = z.object({
    applicationIdentifier: z.string().describe("Application identifier"),
    sourceMapIdentifier: z.string().describe("Source map identifier"),
    uri: z.string().url().describe("New URI for the source map")
});

export const DeleteSourceMapSchema = z.object({
    applicationIdentifier: z.string().describe("Application identifier"),
    sourceMapIdentifier: z.string().describe("Source map identifier")
});

export const UploadSourceMapSchema = z.object({
    applicationIdentifier: z.string().describe("Application identifier"),
    filePath: z.string().describe("Path to the source map file"),
    uri: z.string().url().describe("URI to associate with the source map")
});

export const DeleteAllSourceMapsSchema = z.object({
    applicationIdentifier: z.string().describe("Application identifier")
});