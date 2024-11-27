import {
    ActivateErrorGroupSchema,
    DeleteAllSourceMapsSchema,
    DeleteDeploymentSchema, DeleteSourceMapSchema, ErrorMetricsTimeSeriesSchema,
    GetApplicationByApiKeySchema,
    GetApplicationSchema,
    GetDeploymentSchema,
    GetErrorGroupSchema, GetInvitationSchema, GetSessionSchema, GetSourceMapSchema,
    IgnoreErrorGroupSchema,
    ListApplicationsSchema,
    ListCustomersSchema,
    ListDeploymentsSchema,
    ListErrorGroupsSchema, ListInvitationsSchema,
    ListPagesSchema, ListSessionsSchema, ListSourceMapsSchema, PageMetricsHistogramSchema,
    PageMetricsTimeSeriesSchema,
    PermanentlyIgnoreErrorGroupSchema,
    RegenerateApplicationApiKeySchema,
    ReprocessDeploymentCommitsSchema,
    ResolveErrorGroupSchema, RevokeInvitationSchema, SendInvitationSchema,
    UpdateDeploymentSchema, UpdateSourceMapSchema,
    UploadSourceMapSchema
} from "./schemas.js";
import {z} from "zod";
import {ToolHandler} from "./types.js";
import {allowedDirectories, raygunAPIV3Client} from "./index.js";
import {utils} from "./utils.js";

interface Tool {
    name: string;
    description: string;
    schema: z.ZodType<any>;
    handler: ToolHandler<any>;
}

class ToolRegistry {
    private tools: Map<string, Tool> = new Map();

    register(tool: Tool) {
        this.tools.set(tool.name, tool);
    }

    getTool(name: string): Tool | undefined {
        return this.tools.get(name);
    }

    getAllTools(): Tool[] {
        return Array.from(this.tools.values());
    }
}

const toolRegistry = new ToolRegistry();

// Applications
toolRegistry.register({
    name: "list_applications",
    description: "List all applications under the users account on Raygun",
    schema: ListApplicationsSchema,
    handler: async (args) => {
        return raygunAPIV3Client.listApplications(args);
    },
});

toolRegistry.register({
    name: "get_application",
    description: "Get application by identifier",
    schema: GetApplicationSchema,
    handler: async (args) => {
        return raygunAPIV3Client.getApplication(args.applicationIdentifier);
    },
});

toolRegistry.register({
    name: "get_application_by_api_key",
    description: "Get application by API key",
    schema: GetApplicationByApiKeySchema,
    handler: async (args) => {
        return raygunAPIV3Client.getApplicationByApiKey(args.apiKey);
    },
});

toolRegistry.register({
    name: "regenerate_application_api_key",
    description: "Regenerate application API key",
    schema: RegenerateApplicationApiKeySchema,
    handler: async (args) => {
        return raygunAPIV3Client.regenerateApplicationApiKey(args.applicationIdentifier);
    },
});

// Customers
toolRegistry.register({
    name: "list_customers",
    description: "List customers for an application",
    schema: ListCustomersSchema,
    handler: async (args) => {
        return raygunAPIV3Client.listCustomers(args.applicationIdentifier, args);
    },
});

// Deployments
toolRegistry.register({
    name: "list_deployments",
    description: "List deployments for an application",
    schema: ListDeploymentsSchema,
    handler: async (args) => {
        return raygunAPIV3Client.listDeployments(args.applicationIdentifier, args);
    },
});

toolRegistry.register({
    name: "get_deployment",
    description: "Get deployment by identifier",
    schema: GetDeploymentSchema,
    handler: async (args) => {
        return raygunAPIV3Client.getDeployment(
            args.applicationIdentifier,
            args.deploymentIdentifier
        );
    },
});

toolRegistry.register({
    name: "delete_deployment",
    description: "Delete deployment",
    schema: DeleteDeploymentSchema,
    handler: async (args) => {
        await raygunAPIV3Client.deleteDeployment(
            args.applicationIdentifier,
            args.deploymentIdentifier
        );
        return "Deployment deleted successfully";
    },
});

toolRegistry.register({
    name: "update_deployment",
    description: "Update deployment details",
    schema: UpdateDeploymentSchema,
    handler: async (args) => {
        const { applicationIdentifier, deploymentIdentifier, ...updateData } = args;
        return raygunAPIV3Client.updateDeployment(
            applicationIdentifier,
            deploymentIdentifier,
            updateData
        );
    },
});

toolRegistry.register({
    name: "reprocess_deployment_commits",
    description: "Reprocess deployment commits",
    schema: ReprocessDeploymentCommitsSchema,
    handler: async (args) => {
        await raygunAPIV3Client.reprocessDeploymentCommits(
            args.applicationIdentifier,
            args.deploymentIdentifier
        );
        return "Deployment commits reprocessing initiated";
    },
});

// Error Groups
toolRegistry.register({
    name: "list_error_groups",
    description: "List error groups for an application",
    schema: ListErrorGroupsSchema,
    handler: async (args) => {
        return raygunAPIV3Client.listErrorGroups(args.applicationIdentifier, args);
    },
});

toolRegistry.register({
    name: "get_error_group",
    description: "Get error group by identifier",
    schema: GetErrorGroupSchema,
    handler: async (args) => {
        return raygunAPIV3Client.getErrorGroup(
            args.applicationIdentifier,
            args.errorGroupIdentifier
        );
    },
});

toolRegistry.register({
    name: "resolve_error_group",
    description: "Set the status of the error group to resolved",
    schema: ResolveErrorGroupSchema,
    handler: async (args) => {
        const { applicationIdentifier, errorGroupIdentifier, ...resolveData } = args;
        return raygunAPIV3Client.resolveErrorGroup(
            applicationIdentifier,
            errorGroupIdentifier,
            resolveData
        );
    },
});

toolRegistry.register({
    name: "activate_error_group",
    description: "Set the status of the error group to active",
    schema: ActivateErrorGroupSchema,
    handler: async (args) => {
        return raygunAPIV3Client.activateErrorGroup(
            args.applicationIdentifier,
            args.errorGroupIdentifier
        );
    },
});

toolRegistry.register({
    name: "ignore_error_group",
    description: "Set the status of the error group to ignored",
    schema: IgnoreErrorGroupSchema,
    handler: async (args) => {
        return raygunAPIV3Client.ignoreErrorGroup(
            args.applicationIdentifier,
            args.errorGroupIdentifier
        );
    },
});

toolRegistry.register({
    name: "permanently_ignore_error_group",
    description: "Set the status of the error group to permanently ignored",
    schema: PermanentlyIgnoreErrorGroupSchema,
    handler: async (args) => {
        const { applicationIdentifier, errorGroupIdentifier, ...ignoreData } = args;
        return raygunAPIV3Client.permanentlyIgnoreErrorGroup(
            applicationIdentifier,
            errorGroupIdentifier,
            ignoreData
        );
    },
});

// Pages
toolRegistry.register({
    name: "list_pages",
    description: "List pages for an application",
    schema: ListPagesSchema,
    handler: async (args) => {
        return raygunAPIV3Client.listPages(args.applicationIdentifier, args);
    },
});

// Metrics
toolRegistry.register({
    name: "get_page_metrics_time_series",
    description: "Get time-series metrics for pages",
    schema: PageMetricsTimeSeriesSchema,
    handler: async (args) => {
        return raygunAPIV3Client.getPageMetricsTimeSeries(
            args.applicationIdentifier,
            args
        );
    },
});

toolRegistry.register({
    name: "get_page_metrics_histogram",
    description: "Get histogram metrics for pages",
    schema: PageMetricsHistogramSchema,
    handler: async (args) => {
        return raygunAPIV3Client.getPageMetricsHistogram(
            args.applicationIdentifier,
            args
        );
    },
});

toolRegistry.register({
    name: "get_error_metrics_time_series",
    description: "Get time-series metrics for errors",
    schema: ErrorMetricsTimeSeriesSchema,
    handler: async (args) => {
        return raygunAPIV3Client.getErrorMetricsTimeSeries(
            args.applicationIdentifier,
            args
        );
    },
});

// Sessions
toolRegistry.register({
    name: "list_sessions",
    description: "List sessions for an application",
    schema: ListSessionsSchema,
    handler: async (args) => {
        return raygunAPIV3Client.listSessions(args.applicationIdentifier, args);
    },
});

toolRegistry.register({
    name: "get_session",
    description: "Get session by identifier",
    schema: GetSessionSchema,
    handler: async (args) => {
        return raygunAPIV3Client.getSession(
            args.applicationIdentifier,
            args.sessionIdentifier,
            args
        );
    },
});

// Invitations
toolRegistry.register({
    name: "list_invitations",
    description: "Returns a list invitations that the token and token owner has access to",
    schema: ListInvitationsSchema,
    handler: async (args) => {
        return raygunAPIV3Client.listInvitations(args);
    },
});

toolRegistry.register({
    name: "send_invitation",
    description: "Send an invitation to a user",
    schema: SendInvitationSchema,
    handler: async (args) => {
        return raygunAPIV3Client.sendInvitation(args);
    },
});

toolRegistry.register({
    name: "get_invitation",
    description: "Get an invitation by identifier",
    schema: GetInvitationSchema,
    handler: async (args) => {
        return raygunAPIV3Client.getInvitation(args.invitationIdentifier);
    },
});

toolRegistry.register({
    name: "revoke_invitation",
    description: "Revoke a sent invitation",
    schema: RevokeInvitationSchema,
    handler: async (args) => {
        await raygunAPIV3Client.revokeInvitation(args.invitationIdentifier);
        return "Invitation revoked successfully";
    },
});

// Source Maps
toolRegistry.register({
    name: "list_source_maps",
    description: "Returns a list of source maps for the specified application",
    schema: ListSourceMapsSchema,
    handler: async (args) => {
        return raygunAPIV3Client.listSourceMaps(args.applicationIdentifier, args);
    },
});

toolRegistry.register({
    name: "get_source_map",
    description: "Returns a single source map by identifier",
    schema: GetSourceMapSchema,
    handler: async (args) => {
        return raygunAPIV3Client.getSourceMap(
            args.applicationIdentifier,
            args.sourceMapIdentifier
        );
    },
});

toolRegistry.register({
    name: "update_source_map",
    description: "Update the details of a source map",
    schema: UpdateSourceMapSchema,
    handler: async (args) => {
        return raygunAPIV3Client.updateSourceMap(
            args.applicationIdentifier,
            args.sourceMapIdentifier,
            { uri: args.uri }
        );
    },
});

toolRegistry.register({
    name: "delete_source_map",
    description: "Delete a source map",
    schema: DeleteSourceMapSchema,
    handler: async (args) => {
        await raygunAPIV3Client.deleteSourceMap(
            args.applicationIdentifier,
            args.sourceMapIdentifier
        );
        return "Source map deleted successfully";
    },
});

toolRegistry.register({
    name: "upload_source_map",
    description: "Uploads a source map to the specified application",
    schema: UploadSourceMapSchema,
    handler: async (args) => {
        const validatedPath = await utils.validateSourceMapFile(args.filePath, allowedDirectories);
        return raygunAPIV3Client.uploadSourceMap(
            args.applicationIdentifier,
            validatedPath,
            args.uri
        );
    },
});

toolRegistry.register({
    name: "delete_all_source_maps",
    description: "Deletes all source maps",
    schema: DeleteAllSourceMapsSchema,
    handler: async (args) => {
        await raygunAPIV3Client.deleteAllSourceMaps(args.applicationIdentifier);
        return "All source maps deleted successfully";
    },
});

export { toolRegistry };