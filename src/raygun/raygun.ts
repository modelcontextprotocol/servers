import {
    Application,
    Config,
    ConfigSchema,
    Customer,
    Deployment,
    ErrorGroup,
    HistogramMetrics,
    Invitation,
    Page,
    Session,
    SourceMap,
    TimeSeriesMetrics,
} from "./types.js";
import * as fs from "node:fs/promises";

export class RaygunError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "RaygunError";
  }
}

export class RaygunAPIV3Client {
  private config: Config;

  constructor(config: Partial<Config>) {
    this.config = ConfigSchema.parse({
      baseUrl: "https://api.raygun.com/v3",
      ...config,
    });
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    queryParams?: Record<string, string | number>,
  ): Promise<T> {
    const url = new URL(this.config.baseUrl + path);
    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value != null && value !== '') {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const response = await fetch(url.toString(), {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new RaygunError(
        `Raygun API error: ${url.toString()}: ${response.status}`,
        response.status,
        await response.json().catch(() => undefined),
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as T;
  }

  // Applications
  async listApplications(options?: {
    count?: number;
    offset?: number;
    orderBy?: string[];
  }): Promise<Application[]> {
    return this.request<Application[]>("GET", "/applications", undefined, {
      count: options?.count || 100,
      offset: options?.offset || 0,
      orderby: options?.orderBy?.join(",") || "",
    });
  }

    async getApplication(applicationIdentifier: string): Promise<Application> {
        return this.request<Application>(
            'GET',
            `/applications/${applicationIdentifier}`
        );
    }

    async getApplicationByApiKey(apiKey: string): Promise<Application> {
        return this.request<Application>(
            'GET',
            `/applications/api-key/${apiKey}`
        );
    }

    async regenerateApplicationApiKey(applicationIdentifier: string): Promise<Application> {
        return this.request<Application>(
            'POST',
            `/applications/${applicationIdentifier}/regenerate-api-key`
        );
    }

  async listCustomers(
      applicationIdentifier: string,
      options?: {
        count?: number;
        offset?: number;
        orderBy?: Array<
            | 'isAnonymous'
            | 'isAnonymous desc'
            | 'firstSeenAt'
            | 'firstSeenAt desc'
            | 'lastSeenAt'
            | 'lastSeenAt desc'
        >;
      }
  ): Promise<Customer[]> {
    return this.request<Customer[]>(
        'GET',
        `/applications/${applicationIdentifier}/customers`,
        undefined,
        {
          count: options?.count || 100,
          offset: options?.offset || 0,
          orderby: options?.orderBy?.join(',') || '',
        }
    );
  }

  async listDeployments(
      applicationIdentifier: string,
      options?: {
        count?: number;
        offset?: number;
        orderBy?: Array<
            | 'version'
            | 'version desc'
            | 'emailAddress'
            | 'emailAddress desc'
            | 'ownerName'
            | 'ownerName desc'
            | 'comment'
            | 'comment desc'
            | 'deployedAt'
            | 'deployedAt desc'
        >;
      }
  ): Promise<Deployment[]> {
    return this.request<Deployment[]>(
        'GET',
        `/applications/${applicationIdentifier}/deployments`,
        undefined,
        {
          count: options?.count || 100,
          offset: options?.offset || 0,
          orderby: options?.orderBy?.join(',') || '',
        }
    );
  }

    async getDeployment(
        applicationIdentifier: string,
        deploymentIdentifier: string
    ): Promise<Deployment> {
        return this.request<Deployment>(
            'GET',
            `/applications/${applicationIdentifier}/deployments/${deploymentIdentifier}`
        );
    }

    async deleteDeployment(
        applicationIdentifier: string,
        deploymentIdentifier: string
    ): Promise<void> {
        return this.request<void>(
            'DELETE',
            `/applications/${applicationIdentifier}/deployments/${deploymentIdentifier}`
        );
    }

    async updateDeployment(
        applicationIdentifier: string,
        deploymentIdentifier: string,
        updateData: {
            version?: string;
            ownerName?: string;
            emailAddress?: string;
            comment?: string;
            scmIdentifier?: string;
            scmType?: 'gitHub' | 'gitLab' | 'azureDevOps' | 'bitbucket';
            deployedAt?: string;
        }
    ): Promise<Deployment> {
        return this.request<Deployment>(
            'PATCH',
            `/applications/${applicationIdentifier}/deployments/${deploymentIdentifier}`,
            updateData
        );
    }

    async reprocessDeploymentCommits(
        applicationIdentifier: string,
        deploymentIdentifier: string
    ): Promise<void> {
        return this.request<void>(
            'POST',
            `/applications/${applicationIdentifier}/deployments/${deploymentIdentifier}/reprocess-commits`
        );
    }

  async listErrorGroups(
      applicationIdentifier: string,
      options?: {
        count?: number;
        offset?: number;
        orderBy?: Array<
            | 'message'
            | 'message desc'
            | 'status'
            | 'status desc'
            | 'lastOccurredAt'
            | 'lastOccurredAt desc'
            | 'createdAt'
            | 'createdAt desc'
        >;
      }
  ): Promise<ErrorGroup[]> {
    return this.request<ErrorGroup[]>(
        'GET',
        `/applications/${applicationIdentifier}/error-groups`,
        undefined,
        {
          count: options?.count || 100,
          offset: options?.offset || 0,
          orderby: options?.orderBy?.join(',') || '',
        }
    );
  }

    async getErrorGroup(
        applicationIdentifier: string,
        errorGroupIdentifier: string
    ): Promise<ErrorGroup> {
        return this.request<ErrorGroup>(
            'GET',
            `/applications/${applicationIdentifier}/error-groups/${errorGroupIdentifier}`
        );
    }

    async resolveErrorGroup(
        applicationIdentifier: string,
        errorGroupIdentifier: string,
        data: {
            version: string;
            discardFromPreviousVersions: boolean;
        }
    ): Promise<ErrorGroup> {
        return this.request<ErrorGroup>(
            'POST',
            `/applications/${applicationIdentifier}/error-groups/${errorGroupIdentifier}/resolve`,
            data
        );
    }

    async activateErrorGroup(
        applicationIdentifier: string,
        errorGroupIdentifier: string
    ): Promise<ErrorGroup> {
        return this.request<ErrorGroup>(
            'POST',
            `/applications/${applicationIdentifier}/error-groups/${errorGroupIdentifier}/activate`
        );
    }

    async ignoreErrorGroup(
        applicationIdentifier: string,
        errorGroupIdentifier: string
    ): Promise<ErrorGroup> {
        return this.request<ErrorGroup>(
            'POST',
            `/applications/${applicationIdentifier}/error-groups/${errorGroupIdentifier}/ignore`
        );
    }

    async permanentlyIgnoreErrorGroup(
        applicationIdentifier: string,
        errorGroupIdentifier: string,
        data: {
            discardNewOccurrences: boolean;
        }
    ): Promise<ErrorGroup> {
        return this.request<ErrorGroup>(
            'POST',
            `/applications/${applicationIdentifier}/error-groups/${errorGroupIdentifier}/permanently-ignore`,
            data
        );
    }

    async listInvitations(options?: {
        count?: number;
        offset?: number;
        orderBy?: Array<'emailAddress' | 'emailAddress desc' | 'createdAt' | 'createdAt desc'>;
    }): Promise<Invitation[]> {
        return this.request<Invitation[]>(
            'GET',
            '/invitations',
            undefined,
            {
                count: options?.count || 100,
                offset: options?.offset || 0,
                orderby: options?.orderBy?.join(',') || ''
            }
        );
    }

    async sendInvitation(data: {
        emailAddress: string;
    }): Promise<Invitation> {
        return this.request<Invitation>(
            'POST',
            '/invitations',
            data
        );
    }

    async getInvitation(invitationIdentifier: string): Promise<Invitation> {
        return this.request<Invitation>(
            'GET',
            `/invitations/${invitationIdentifier}`
        );
    }

    async revokeInvitation(invitationIdentifier: string): Promise<void> {
        return this.request<void>(
            'POST',
            `/invitations/${invitationIdentifier}/revoke`
        );
    }

    async listPages(
        applicationIdentifier: string,
        options?: {
            count?: number;
            offset?: number;
            orderBy?: Array<
                | 'lastSeenAt'
                | 'lastSeenAt desc'
                | 'uri'
                | 'uri desc'
                | 'name'
                | 'name desc'
            >;
        }
    ): Promise<Page[]> {
        return this.request<Page[]>(
            'GET',
            `/applications/${applicationIdentifier}/pages`,
            undefined,
            {
                count: options?.count || 100,
                offset: options?.offset || 0,
                orderby: options?.orderBy?.join(',') || '',
            }
        );
    }

    async getPageMetricsTimeSeries(
        applicationIdentifier: string,
        params: {
            start: string;
            end: string;
            granularity: string;
            aggregation: 'count' | 'average' | 'median' | 'sum' | 'min' | 'max' | 'p95' | 'p99';
            metrics: Array<
                | 'pageViews'
                | 'loadTime'
                | 'firstPaint'
                | 'firstContentfulPaint'
                | 'firstInputDelay'
                | 'largestContentfulPaint'
                | 'cumulativeLayoutShift'
                | 'interactionToNextPaint'
            >;
            filter?: string;
        }
    ): Promise<TimeSeriesMetrics> {
        return this.request<TimeSeriesMetrics>(
            'POST',
            `/metrics/${applicationIdentifier}/pages/time-series`,
            params
        );
    }

    async getPageMetricsHistogram(
        applicationIdentifier: string,
        params: {
            start: string;
            end: string;
            metrics: Array<
                | 'loadTime'
                | 'firstPaint'
                | 'firstContentfulPaint'
                | 'firstInputDelay'
                | 'largestContentfulPaint'
                | 'cumulativeLayoutShift'
                | 'interactionToNextPaint'
            >;
            filter?: string;
        }
    ): Promise<HistogramMetrics> {
        return this.request<HistogramMetrics>(
            'POST',
            `/metrics/${applicationIdentifier}/pages/histogram`,
            params
        );
    }

    async getErrorMetricsTimeSeries(
        applicationIdentifier: string,
        params: {
            start: string;
            end: string;
            granularity: string;
            aggregation: 'count';
            metrics: Array<'errorInstances'>;
            filter?: string;
        }
    ): Promise<TimeSeriesMetrics> {
        return this.request<TimeSeriesMetrics>(
            'POST',
            `/metrics/${applicationIdentifier}/errors/time-series`,
            params
        );
    }

    async listSessions(
        applicationIdentifier: string,
        options?: {
            count?: number;
            offset?: number;
            filter?: string;
            orderBy?: Array<
                | 'customerIdentifier'
                | 'customerIdentifier desc'
                | 'startedAt'
                | 'startedAt desc'
                | 'updatedAt'
                | 'updatedAt desc'
                | 'endedAt'
                | 'endedAt desc'
                | 'countryCode'
                | 'countryCode desc'
                | 'platformName'
                | 'platformName desc'
                | 'operatingSystemName'
                | 'operatingSystemName desc'
                | 'operatingSystemVersion'
                | 'operatingSystemVersion desc'
                | 'browserName'
                | 'browserName desc'
                | 'browserVersion'
                | 'browserVersion desc'
                | 'viewportWidth'
                | 'viewportWidth desc'
                | 'viewportHeight'
                | 'viewportHeight desc'
                | 'deploymentVersion'
                | 'deploymentVersion desc'
            >;
        }
    ): Promise<Session[]> {
        return this.request<Session[]>(
            'GET',
            `/applications/${applicationIdentifier}/sessions`,
            undefined,
            {
                count: options?.count || 100,
                offset: options?.offset || 0,
                filter: options?.filter || '',
                orderby: options?.orderBy?.join(',') || '',
            }
        );
    }

    async getSession(
        applicationIdentifier: string,
        sessionIdentifier: string,
        options?: {
            include?: Array<'pageViews' | 'errors'>;
        }
    ): Promise<Session> {
        const params: Record<string, string> = {};
        if (options?.include) {
            params.include = options.include.join(',');
        }

        return this.request<Session>(
            'GET',
            `/applications/${applicationIdentifier}/sessions/${sessionIdentifier}`,
            undefined,
            params
        );
    }

    async listSourceMaps(
        applicationIdentifier: string,
        options?: {
            count?: number;
            offset?: number;
            orderBy?: Array<
                | 'uri' | 'uri desc'
                | 'fileName' | 'fileName desc'
                | 'fileSizeBytes' | 'fileSizeBytes desc'
                | 'uploadedAt' | 'uploadedAt desc'
                | 'createdAt' | 'createdAt desc'
                | 'updatedAt' | 'updatedAt desc'
            >;
        }
    ): Promise<SourceMap[]> {
        return this.request<SourceMap[]>(
            'GET',
            `/applications/${applicationIdentifier}/source-maps`,
            undefined,
            {
                count: options?.count || 100,
                offset: options?.offset || 0,
                orderby: options?.orderBy?.join(',') || ''
            }
        );
    }

    async getSourceMap(
        applicationIdentifier: string,
        sourceMapIdentifier: string
    ): Promise<SourceMap> {
        return this.request<SourceMap>(
            'GET',
            `/applications/${applicationIdentifier}/source-maps/${sourceMapIdentifier}`
        );
    }

    async updateSourceMap(
        applicationIdentifier: string,
        sourceMapIdentifier: string,
        data: {
            uri: string;
        }
    ): Promise<SourceMap> {
        return this.request<SourceMap>(
            'PATCH',
            `/applications/${applicationIdentifier}/source-maps/${sourceMapIdentifier}`,
            data
        );
    }

    async deleteSourceMap(
        applicationIdentifier: string,
        sourceMapIdentifier: string
    ): Promise<void> {
        return this.request<void>(
            'DELETE',
            `/applications/${applicationIdentifier}/source-maps/${sourceMapIdentifier}`
        );
    }

    async uploadSourceMap(
        applicationIdentifier: string,
        filePath: string,
        uri: string
    ): Promise<SourceMap> {
        const formData = new FormData();
        const fileStream = await fs.readFile(filePath);

        const file = new Blob([fileStream], {
            type: 'application/json'
        });

        const fileName = filePath.split('/').pop() || 'sourcemap.js.map';
        formData.append('file', file, fileName);
        formData.append('uri', uri);

        const url = new URL(this.config.baseUrl + `/applications/${applicationIdentifier}/source-maps`);

        const response = await fetch(url.toString(), {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${this.config.apiKey}`,
            },
            body: formData,
        });

        if (!response.ok) {
            throw new RaygunError(
                `Raygun API error: ${url.toString()}: ${response.status}`,
                response.status,
                await response.json().catch(() => undefined)
            );
        }

        return response.json() as Promise<SourceMap>;
    }

    async deleteAllSourceMaps(
        applicationIdentifier: string
    ): Promise<void> {
        return this.request<void>(
            'DELETE',
            `/applications/${applicationIdentifier}/source-maps`
        );
    }
}
