/**
 * Base service for Zendesk API client
 */
import axios, { AxiosRequestConfig, AxiosInstance } from "axios";
import { ZendeskConfig } from "../types/config.types.js";

/**
 * Base service class that handles HTTP requests to Zendesk API
 */
export class BaseService {
  protected baseUrl: string;
  protected config: ZendeskConfig;
  protected httpClient: AxiosInstance;

  /**
   * Creates a new BaseService instance
   * @param config Zendesk API configuration
   */
  constructor(config: ZendeskConfig) {
    this.config = config;
    this.baseUrl = `https://${config.subdomain}.zendesk.com/api/v2`;
    
    // Create Axios instance with common configuration
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      headers: {
        "Content-Type": "application/json"
      }
    });

    // Add request interceptor for authentication
    this.httpClient.interceptors.request.use((config) => {
      const authToken = Buffer.from(`${this.config.email}/token:${this.config.apiToken}`).toString('base64');
      config.headers = config.headers || {};
      config.headers["Authorization"] = `Basic ${authToken}`;
      return config;
    });

    // Add response interceptor for error handling
    this.httpClient.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error("API Request Error:", {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          message: error.message,
          data: error.response?.data
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Makes a request to the Zendesk API
   * @param url API endpoint URL
   * @param params Query parameters
   * @param method HTTP method
   * @param data Request body data
   * @returns Response data
   */
  protected async makeRequest<T>(
    url: string,
    params: Record<string, string | number | boolean> = {},
    method: string = "GET",
    data?: any
  ): Promise<T> {
    try {
      const config: AxiosRequestConfig = {
        method,
        url,
        params,
        data
      };
      
      const response = await this.httpClient(config);
      return response.data as T;
    } catch (error) {
      console.error("Request error:", error);
      throw error;
    }
  }
}
