export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

export interface SearchResponse {
  searchParameters: {
    query: string;
    search_service: string;
    max_results: number;
    crawl_results: number;
    gl: string;
    hl: string;
    image: boolean;
  };
  results: SearchResult[];
}

export interface SearchArgs {
  query: string;
  max_results?: number;
  search_service?: string;
}

export function isValidSearchArgs(args: unknown): args is SearchArgs {
  if (typeof args !== 'object' || args === null) {
    return false;
  }

  const { query, max_results, search_service } = args as SearchArgs;

  if (typeof query !== 'string' || query.trim().length === 0) {
    return false;
  }

  if (max_results !== undefined && (typeof max_results !== 'number' || max_results < 1 || max_results > 50)) {
    return false;
  }

  if (search_service !== undefined && typeof search_service !== 'string') {
    return false;
  }

  return true;
}

export interface CrawlResult {
  title: string;
  link: string;
  content: string;
}

export interface CrawlResponse {
  crawlParameters: {
    url: string;
  };
  results: CrawlResult;
}

export interface CrawlArgs {
  url: string;
}

export function isValidCrawlArgs(args: unknown): args is CrawlArgs {
  if (typeof args !== 'object' || args === null) {
    return false;
  }

  const { url } = args as CrawlArgs;

  if (typeof url !== 'string' || url.trim().length === 0) {
    return false;
  }

  return true;
}

export interface SitemapResponse {
  links: string[];
}

export interface SitemapArgs {
  url: string;
}

export function isValidSitemapArgs(args: unknown): args is SitemapArgs {
  if (typeof args !== 'object' || args === null) {
    return false;
  }

  const { url } = args as SitemapArgs;

  if (typeof url !== 'string' || url.trim().length === 0) {
    return false;
  }

  return true;
}