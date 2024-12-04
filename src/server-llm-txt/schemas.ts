import { z } from 'zod';

// Schema for items in the list view (without content)
export const LLMTxtListItemSchema = z.object({
  id: z.number(),
  url: z.string().url(),
  name: z.string(),
  description: z.string()
});

export type LLMTxtListItem = z.infer<typeof LLMTxtListItemSchema>;

// Schema for a full item with content
export const LLMTxtSchema = z.object({
  id: z.number(),
  url: z.string().url(),
  name: z.string(),
  description: z.string(),
  content: z.string(),
  hasNextPage: z.boolean().optional(),
  currentPage: z.number()
});

export type LLMTxt = z.infer<typeof LLMTxtSchema>;

// List of items (without content)
export const LLMTxtListSchema = z.array(LLMTxtListItemSchema);

export type LLMTxtList = z.infer<typeof LLMTxtListSchema>;

export const GetLLMTxtOptionsSchema = z.object({
  id: z.number().describe(
    "The ID of the LLM.txt file to fetch. Must be obtained first using the list_llm_txt command."
  ),
  page: z.number().optional().default(1).describe(
    "Page number to fetch, starting from 1. Each page contains a fixed number of characters."
  )
});

export type GetLLMTxtOptions = z.infer<typeof GetLLMTxtOptionsSchema>;

export const ListLLMTxtOptionsSchema = z.object({
  // Empty object since we're removing pagination
});

export type ListLLMTxtOptions = z.infer<typeof ListLLMTxtOptionsSchema>; 