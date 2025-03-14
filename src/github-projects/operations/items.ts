/**
 * Operations for managing GitHub Project (V2) items
 */
import { z } from "zod";
import { graphqlRequest, escapeGraphQLString } from "../common/utils.js";

// Schemas
export const ListItemsSchema = z.object({
  project_id: z.string().describe("ID of the project"),
  first: z.number().optional().describe("Number of items to return"),
  after: z.string().optional().describe("Cursor for pagination"),
});

export const AddItemSchema = z.object({
  project_id: z.string().describe("ID of the project"),
  content_id: z.string().describe("ID of the issue or pull request to add"),
});

export const CreateDraftItemSchema = z.object({
  project_id: z.string().describe("ID of the project"),
  title: z.string().describe("Title of the draft item"),
  body: z.string().optional().describe("Body of the draft item"),
});

export const RemoveItemSchema = z.object({
  project_id: z.string().describe("ID of the project"),
  item_id: z.string().describe("ID of the item to remove"),
});

export const GetItemSchema = z.object({
  project_id: z.string().describe("ID of the project"),
  item_id: z.string().describe("ID of the item"),
});

/**
 * List items in a GitHub Project (V2)
 * 
 * @param projectId ID of the project
 * @param first Number of items to return (default: 20)
 * @param after Cursor for pagination
 * @returns List of items with pagination info
 */
export async function listItems(
  projectId: string,
  first: number = 20,
  after?: string
) {
  const safeProjectId = escapeGraphQLString(projectId);
  const afterClause = after ? `, after: "${escapeGraphQLString(after)}"` : "";
  
  const query = `
    query {
      node(id: "${safeProjectId}") {
        ... on ProjectV2 {
          items(first: ${first} ${afterClause}) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              fieldValues(first: 8) {
                nodes {
                  ... on ProjectV2ItemFieldTextValue {
                    text
                    field {
                      ... on ProjectV2FieldCommon {
                        name
                        id
                      }
                    }
                  }
                  ... on ProjectV2ItemFieldDateValue {
                    date
                    field {
                      ... on ProjectV2FieldCommon {
                        name
                        id
                      }
                    }
                  }
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field {
                      ... on ProjectV2FieldCommon {
                        name
                        id
                      }
                    }
                  }
                }
              }
              content {
                ... on DraftIssue {
                  title
                  body
                }
                ... on Issue {
                  title
                  url
                  number
                  state
                  repository {
                    name
                    owner {
                      login
                    }
                  }
                }
                ... on PullRequest {
                  title
                  url
                  number
                  state
                  repository {
                    name
                    owner {
                      login
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await graphqlRequest(query);
  return {
    items: (response as any).node.items.nodes,
    pageInfo: (response as any).node.items.pageInfo
  };
}

/**
 * Add an issue or pull request to a GitHub Project (V2)
 * 
 * @param projectId ID of the project
 * @param contentId ID of the issue or pull request to add
 * @returns Added item
 */
export async function addItem(projectId: string, contentId: string) {
  const safeProjectId = escapeGraphQLString(projectId);
  const safeContentId = escapeGraphQLString(contentId);
  
  const mutation = `
    mutation {
      addProjectV2ItemById(input: {
        projectId: "${safeProjectId}"
        contentId: "${safeContentId}"
      }) {
        item {
          id
        }
      }
    }
  `;

  const response = await graphqlRequest(mutation);
  return (response as any).addProjectV2ItemById.item;
}

/**
 * Create a draft item in a GitHub Project (V2)
 * 
 * @param projectId ID of the project
 * @param title Title of the draft item
 * @param body Optional body of the draft item
 * @returns Created item
 */
export async function createDraftItem(
  projectId: string,
  title: string,
  body?: string
) {
  const safeProjectId = escapeGraphQLString(projectId);
  const safeTitle = escapeGraphQLString(title);
  const safeBody = body ? escapeGraphQLString(body) : undefined;
  
  const mutation = `
    mutation {
      addProjectV2DraftIssue(input: {
        projectId: "${safeProjectId}"
        title: "${safeTitle}"
        ${safeBody ? `body: "${safeBody}"` : ""}
      }) {
        projectItem {
          id
        }
      }
    }
  `;

  const response = await graphqlRequest(mutation);
  return (response as any).addProjectV2DraftIssue.projectItem;
}

/**
 * Remove an item from a GitHub Project (V2)
 * 
 * @param projectId ID of the project
 * @param itemId ID of the item to remove
 * @returns Deleted item ID
 */
export async function removeItem(projectId: string, itemId: string) {
  const safeProjectId = escapeGraphQLString(projectId);
  const safeItemId = escapeGraphQLString(itemId);
  
  const mutation = `
    mutation {
      deleteProjectV2Item(input: {
        projectId: "${safeProjectId}"
        itemId: "${safeItemId}"
      }) {
        deletedItemId
      }
    }
  `;

  const response = await graphqlRequest(mutation);
  return { 
    deletedItemId: (response as any).deleteProjectV2Item.deletedItemId 
  };
}

/**
 * Get a specific item from a GitHub Project (V2)
 * 
 * @param projectId ID of the project
 * @param itemId ID of the item
 * @returns Item details
 */
export async function getItem(projectId: string, itemId: string) {
  const safeItemId = escapeGraphQLString(itemId);
  
  const query = `
    query {
      node(id: "${safeItemId}") {
        ... on ProjectV2Item {
          id
          fieldValues(first: 20) {
            nodes {
              ... on ProjectV2ItemFieldTextValue {
                text
                field {
                  ... on ProjectV2FieldCommon {
                    name
                    id
                  }
                }
              }
              ... on ProjectV2ItemFieldDateValue {
                date
                field {
                  ... on ProjectV2FieldCommon {
                    name
                    id
                  }
                }
              }
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field {
                  ... on ProjectV2FieldCommon {
                    name
                    id
                  }
                }
              }
            }
          }
          content {
            ... on DraftIssue {
              title
              body
            }
            ... on Issue {
              title
              url
              number
              state
              repository {
                name
                owner {
                  login
                }
              }
            }
            ... on PullRequest {
              title
              url
              number
              state
              repository {
                name
                owner {
                  login
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await graphqlRequest(query);
  return (response as any).node;
} 