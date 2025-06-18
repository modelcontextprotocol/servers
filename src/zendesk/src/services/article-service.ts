/**
 * Service for Zendesk Help Center articles
 */
import { BaseService } from "./base-service.js";
import { 
  ZendeskArticle, 
  ZendeskSearchResponse, 
  ZendeskArticleResponse,
  ArticleSearchParams,
  ArticleGetParams
} from "../types/article.types.js";
import { ZendeskConfig } from "../types/config.types.js";
import { cleanHtmlContent } from "../utils/html-cleaner.js";

/**
 * Service class for Zendesk Help Center articles
 */
export class ArticleService extends BaseService {
  private defaultLocale: string;

  /**
   * Creates a new ArticleService instance
   * @param config Zendesk API configuration
   */
  constructor(config: ZendeskConfig) {
    super(config);
    this.defaultLocale = config.defaultLocale || "en";
  }

  /**
   * Search for articles in Zendesk Help Center
   * @param params Search parameters including query, locale, page, and per_page
   * @returns Search results with filtered article data
   */
  async searchArticles(params: ArticleSearchParams): Promise<ZendeskSearchResponse> {
    const { query, locale = this.defaultLocale, page = 1, per_page = 20 } = params;
    const searchUrl = `/help_center/articles/search.json`;

    const data = await this.makeRequest<ZendeskSearchResponse>(searchUrl, {
      query,
      locale,
      page,
      per_page,
    });

    // Filter results to only include specified fields
    if (data.results && Array.isArray(data.results)) {
      data.results = data.results.map((article: ZendeskArticle) => {
        // Only keep the specified fields
        const filteredArticle: Partial<ZendeskArticle> = {
          id: article.id,
          url: article.url,
          html_url: article.html_url,
          author_id: article.author_id,
          created_at: article.created_at,
          updated_at: article.updated_at,
          title: article.title,
          label_names: article.label_names,
        };
        return filteredArticle as ZendeskArticle;
      });
    }

    return data;
  }

  /**
   * Get detailed information about a specific article
   * @param params Parameters including article ID and locale
   * @returns Article data with cleaned HTML content
   */
  async getArticle(params: ArticleGetParams): Promise<ZendeskArticleResponse> {
    const { id, locale = this.defaultLocale } = params;
    const articleUrl = `/help_center/articles/${id}.json`;

    const data = await this.makeRequest<ZendeskArticleResponse>(articleUrl, { locale });

    // Filter article to only include specified fields
    if (data.article) {
      const filteredArticle: Partial<ZendeskArticle> = {
        id: data.article.id,
        url: data.article.url,
        html_url: data.article.html_url,
        author_id: data.article.author_id,
        created_at: data.article.created_at,
        updated_at: data.article.updated_at,
        title: data.article.title,
        label_names: data.article.label_names,
        body: cleanHtmlContent(data.article.body),
      };

      data.article = filteredArticle as ZendeskArticle;
    }

    return data;
  }
}
