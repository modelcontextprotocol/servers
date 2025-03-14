/**
 * Operations for managing GitHub Projects (V2)
 */
import { z } from "zod";
import { graphqlRequest, escapeGraphQLString } from "../common/utils.js";

// Schemas
export const ListProjectsSchema = z.object({
  owner: z.string().describe("Username or organization name"),
  type: z.enum(["user", "organization"]).describe("Type of owner (user or organization)"),
  first: z.number().optional().describe("Number of projects to return"),
});

export const GetProjectSchema = z.object({
  project_id: z.string().describe("ID of the project"),
});

export const CreateProjectSchema = z.object({
  owner: z.string().describe("Username or organization name"),
  title: z.string().describe("Title of the project"),
  description: z.string().optional().describe("Description of the project"),
  type: z.enum(["user", "organization"]).describe("Type of owner (user or organization)"),
});

export const UpdateProjectSchema = z.object({
  project_id: z.string().describe("ID of the project"),
  title: z.string().optional().describe("New title for the project"),
  closed: z.boolean().optional().describe("Whether the project is closed"),
  description: z.string().optional().describe("New description for the project"),
});

export const DeleteProjectSchema = z.object({
  project_id: z.string().describe("ID of the project"),
});

/**
 * List GitHub Projects (V2) for a user or organization
 * 
 * @param owner Username or organization name
 * @param type Type of owner (user or organization)
 * @param first Number of projects to return (default: 20)
 * @returns List of projects
 */
export async function listProjects(
  owner: string,
  type: "user" | "organization",
  first: number = 20
) {
  const safeOwner = escapeGraphQLString(owner);
  const query = type === "user" 
    ? `
      query {
        user(login: "${safeOwner}") {
          projectsV2(first: ${first}) {
            nodes {
              id
              title
              number
              closed
              url
              createdAt
              updatedAt
            }
          }
        }
      }
    `
    : `
      query {
        organization(login: "${safeOwner}") {
          projectsV2(first: ${first}) {
            nodes {
              id
              title
              number
              closed
              url
              createdAt
              updatedAt
            }
          }
        }
      }
    `;

  const response = await graphqlRequest(query);
  return type === "user" 
    ? (response as any).user.projectsV2.nodes 
    : (response as any).organization.projectsV2.nodes;
}

/**
 * Get details of a GitHub Project (V2)
 * 
 * @param projectId ID of the project
 * @returns Project details
 */
export async function getProject(projectId: string) {
  const safeProjectId = escapeGraphQLString(projectId);
  const query = `
    query {
      node(id: "${safeProjectId}") {
        ... on ProjectV2 {
          id
          title
          number
          url
          closed
          createdAt
          updatedAt
          readme
          shortDescription
          public
          items(first: 20) {
            totalCount
          }
          fields(first: 20) {
            nodes {
              ... on ProjectV2FieldCommon {
                id
                name
              }
            }
          }
          views(first: 20) {
            nodes {
              id
              name
              layout
            }
          }
        }
      }
    }
  `;

  const response = await graphqlRequest(query);
  return (response as any).node;
}

/**
 * Create a new GitHub Project (V2)
 * 
 * @param owner Username or organization name
 * @param title Title of the project
 * @param type Type of owner (user or organization)
 * @param description Optional description of the project
 * @returns Created project
 */
export async function createProject(
  owner: string,
  title: string,
  type: "user" | "organization",
  description?: string
) {
  const safeOwner = escapeGraphQLString(owner);
  const safeTitle = escapeGraphQLString(title);
  const safeDescription = description ? escapeGraphQLString(description) : undefined;
  
  // First, we need to get the owner ID
  const ownerQuery = type === "user" 
    ? `query { user(login: "${safeOwner}") { id } }`
    : `query { organization(login: "${safeOwner}") { id } }`;

  const ownerResponse = await graphqlRequest(ownerQuery);
  const ownerId = type === "user" 
    ? (ownerResponse as any).user.id 
    : (ownerResponse as any).organization.id;

  // Now create the project
  const mutation = `
    mutation {
      createProjectV2(input: {
        ownerId: "${ownerId}"
        title: "${safeTitle}"
        ${safeDescription ? `description: "${safeDescription}"` : ""}
      }) {
        projectV2 {
          id
          title
          number
          url
        }
      }
    }
  `;

  const response = await graphqlRequest(mutation);
  return (response as any).createProjectV2.projectV2;
}

/**
 * Update an existing GitHub Project (V2)
 * 
 * @param projectId ID of the project
 * @param title Optional new title for the project
 * @param closed Optional flag to close or open the project
 * @param description Optional new description for the project
 * @returns Updated project
 */
export async function updateProject(
  projectId: string,
  title?: string,
  closed?: boolean,
  description?: string
) {
  const safeProjectId = escapeGraphQLString(projectId);
  
  let updateFields = "";
  if (title) updateFields += `title: "${escapeGraphQLString(title)}" `;
  if (closed !== undefined) updateFields += `closed: ${closed} `;
  if (description) updateFields += `shortDescription: "${escapeGraphQLString(description)}" `;

  const mutation = `
    mutation {
      updateProjectV2(input: {
        projectId: "${safeProjectId}"
        ${updateFields}
      }) {
        projectV2 {
          id
          title
          number
          closed
          shortDescription
        }
      }
    }
  `;

  const response = await graphqlRequest(mutation);
  return (response as any).updateProjectV2.projectV2;
}

/**
 * Delete a GitHub Project (V2)
 * 
 * @param projectId ID of the project
 * @returns Success status
 */
export async function deleteProject(projectId: string) {
  const safeProjectId = escapeGraphQLString(projectId);
  
  const mutation = `
    mutation {
      deleteProjectV2(input: {
        projectId: "${safeProjectId}"
      }) {
        clientMutationId
      }
    }
  `;

  await graphqlRequest(mutation);
  return { success: true };
} 