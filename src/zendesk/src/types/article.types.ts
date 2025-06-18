/**
 * Type definitions for Zendesk Help Center articles
 */

// Base article interface for Zendesk Help Center
export interface ZendeskArticle extends Record<string, unknown> {
  id: number;
  url: string;
  html_url: string;
  author_id: number;
  comments_disabled: boolean;
  draft: boolean;
  promoted: boolean;
  position: number;
  vote_sum: number;
  vote_count: number;
  section_id: number;
  created_at: string;
  updated_at: string;
  name: string;
  title: string;
  source_locale: string;
  locale: string;
  outdated: boolean;
  outdated_locales: string[];
  edited_at: string;
  user_segment_id: number | null;
  permission_group_id: number;
  content_tag_ids: number[];
  label_names: string[];
  body?: string; // Optional to allow filtering out
}

export interface ZendeskSearchResponse {
  results: ZendeskArticle[];
  count: number;
  next_page?: string;
  previous_page?: string;
}

export interface ZendeskArticleResponse {
  article: ZendeskArticle;
}

export interface ArticleSearchParams {
  query: string;
  locale?: string;
  page?: number;
  per_page?: number;
}

export interface ArticleGetParams {
  id: number;
  locale?: string;
}
