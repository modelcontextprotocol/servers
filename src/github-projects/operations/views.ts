/**
 * Operations for managing GitHub Project (V2) views
 */
import { z } from "zod";
import { graphqlRequest, escapeGraphQLString } from "../common/utils.js";

// Schemas
export const ListViewsSchema = z.object({
  project_id: z.string().describe("ID of the project"),
});

export const CreateViewSchema = z.object({
  project_id: z.string().describe("ID of the project"),
  name: z.string().describe("Name of the view"),
  layout: z.enum(["BOARD", "TABLE"]).describe("Layout type"),
});

export const UpdateViewSchema = z.object({
  project_id: z.string().describe("ID of the project"),
  view_id: z.string().describe("ID of the view"),
  name: z.string().optional().describe("New name for the view"),
  layout: z.enum(["BOARD", "TABLE"]).optional().describe("New layout type"),
});

export const DeleteViewSchema = z.object({
  project_id: z.string().describe("ID of the project"),
  view_id: z.string().describe("ID of the view to delete"),
});

/**
 * List views in a GitHub Project (V2)
 * 
 * @param projectId ID of the project
 * @returns List of views
 */
export async function listViews(projectId: string) {
  const safeProjectId = escapeGraphQLString(projectId);
  
  const query = `
    query {
      node(id: "${safeProjectId}") {
        ... on ProjectV2 {
          views(first: 20) {
            nodes {
              id
              name
              layout
              createdAt
              updatedAt
            }
          }
        }
      }
    }
  `;

  const response = await graphqlRequest(query);
  return (response as any).node.views.nodes;
}

/**
 * Create a new view in a GitHub Project (V2)
 * 
 * @param projectId ID of the project
 * @param name Name of the view
 * @param layout Layout type (BOARD or TABLE)
 * @returns Created view
 */
export async function createView(
  projectId: string,
  name: string,
  layout: "BOARD" | "TABLE"
) {
  const safeProjectId = escapeGraphQLString(projectId);
  const safeName = escapeGraphQLString(name);
  
  const mutation = `
    mutation {
      createProjectV2View(input: {
        projectId: "${safeProjectId}"
        name: "${safeName}"
        layout: ${layout}
      }) {
        projectV2View {
          id
          name
          layout
        }
      }
    }
  `;

  const response = await graphqlRequest(mutation);
  return (response as any).createProjectV2View.projectV2View;
}

/**
 * Update an existing view in a GitHub Project (V2)
 * 
 * @param projectId ID of the project
 * @param viewId ID of the view
 * @param name Optional new name for the view
 * @param layout Optional new layout type
 * @returns Updated view
 */
export async function updateView(
  projectId: string,
  viewId: string,
  name?: string,
  layout?: "BOARD" | "TABLE"
) {
  const safeProjectId = escapeGraphQLString(projectId);
  const safeViewId = escapeGraphQLString(viewId);
  
  let updateFields = "";
  if (name) updateFields += `name: "${escapeGraphQLString(name)}" `;
  if (layout) updateFields += `layout: ${layout} `;

  const mutation = `
    mutation {
      updateProjectV2View(input: {
        projectId: "${safeProjectId}"
        viewId: "${safeViewId}"
        ${updateFields}
      }) {
        projectV2View {
          id
          name
          layout
        }
      }
    }
  `;

  const response = await graphqlRequest(mutation);
  return (response as any).updateProjectV2View.projectV2View;
}

/**
 * Delete a view from a GitHub Project (V2)
 * 
 * @param projectId ID of the project
 * @param viewId ID of the view to delete
 * @returns Deleted view ID
 */
export async function deleteView(projectId: string, viewId: string) {
  const safeProjectId = escapeGraphQLString(projectId);
  const safeViewId = escapeGraphQLString(viewId);
  
  const mutation = `
    mutation {
      deleteProjectV2View(input: {
        projectId: "${safeProjectId}"
        viewId: "${safeViewId}"
      }) {
        deletedViewId
      }
    }
  `;

  const response = await graphqlRequest(mutation);
  return {
    deletedViewId: (response as any).deleteProjectV2View.deletedViewId
  };
} 