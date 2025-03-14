/**
 * Operations for managing GitHub Project (V2) fields
 */
import { z } from "zod";
import { graphqlRequest, escapeGraphQLString } from "../common/utils.js";

// Schemas
export const ListFieldsSchema = z.object({
  project_id: z.string().describe("ID of the project"),
});

export const CreateFieldSchema = z.object({
  project_id: z.string().describe("ID of the project"),
  name: z.string().describe("Name of the field"),
  dataType: z.enum(["TEXT", "DATE", "SINGLE_SELECT", "NUMBER"]).describe("Type of field to create"),
  options: z.array(z.string()).optional().describe("Options for single select fields"),
});

export const UpdateFieldValueSchema = z.object({
  project_id: z.string().describe("ID of the project"),
  item_id: z.string().describe("ID of the item"),
  field_id: z.string().describe("ID of the field"),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.object({
      optionId: z.string().describe("ID of the selected option")
    }).optional()
  ]).describe("Value to set"),
});

export const DeleteFieldSchema = z.object({
  project_id: z.string().describe("ID of the project"),
  field_id: z.string().describe("ID of the field to delete"),
});

/**
 * List fields in a GitHub Project (V2)
 * 
 * @param projectId ID of the project
 * @returns List of fields
 */
export async function listFields(projectId: string) {
  const safeProjectId = escapeGraphQLString(projectId);
  
  const query = `
    query {
      node(id: "${safeProjectId}") {
        ... on ProjectV2 {
          fields(first: 50) {
            nodes {
              ... on ProjectV2FieldCommon {
                id
                name
                dataType
              }
              ... on ProjectV2SingleSelectField {
                id
                name
                dataType
                options {
                  id
                  name
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await graphqlRequest(query);
  return (response as any).node.fields.nodes;
}

/**
 * Create a new field in a GitHub Project (V2)
 * 
 * @param projectId ID of the project
 * @param name Name of the field
 * @param dataType Type of field to create
 * @param options Options for single select fields
 * @returns Created field
 */
export async function createField(
  projectId: string,
  name: string,
  dataType: "TEXT" | "DATE" | "SINGLE_SELECT" | "NUMBER",
  options?: string[]
) {
  const safeProjectId = escapeGraphQLString(projectId);
  const safeName = escapeGraphQLString(name);
  
  let mutation = "";
  
  if (dataType === "SINGLE_SELECT") {
    const optionsString = options 
      ? options.map(opt => `"${escapeGraphQLString(opt)}"`).join(",") 
      : "";
      
    mutation = `
      mutation {
        createProjectV2Field(input: {
          projectId: "${safeProjectId}"
          name: "${safeName}"
          dataType: ${dataType}
          singleSelectOptions: [${optionsString}]
        }) {
          field {
            ... on ProjectV2SingleSelectField {
              id
              name
              options {
                id
                name
              }
            }
          }
        }
      }
    `;
  } else {
    mutation = `
      mutation {
        createProjectV2Field(input: {
          projectId: "${safeProjectId}"
          name: "${safeName}"
          dataType: ${dataType}
        }) {
          field {
            ... on ProjectV2FieldCommon {
              id
              name
              dataType
            }
          }
        }
      }
    `;
  }

  const response = await graphqlRequest(mutation);
  return (response as any).createProjectV2Field.field;
}

/**
 * Update a field value for an item in a GitHub Project (V2)
 * 
 * @param projectId ID of the project
 * @param itemId ID of the item
 * @param fieldId ID of the field
 * @param value Value to set (string, number, boolean, or option ID object)
 * @returns Updated item
 */
export async function updateFieldValue(
  projectId: string,
  itemId: string,
  fieldId: string,
  value: string | number | boolean | { optionId: string }
) {
  const safeProjectId = escapeGraphQLString(projectId);
  const safeItemId = escapeGraphQLString(itemId);
  const safeFieldId = escapeGraphQLString(fieldId);
  
  let valueString = "";
  
  if (typeof value === "string") {
    valueString = `text: "${escapeGraphQLString(value)}"`;
  } else if (typeof value === "number") {
    valueString = `number: ${value}`;
  } else if (typeof value === "boolean") {
    valueString = `date: "${value ? new Date().toISOString() : null}"`;
  } else if (value && 'optionId' in value) {
    valueString = `singleSelectOptionId: "${escapeGraphQLString(value.optionId)}"`;
  }

  const mutation = `
    mutation {
      updateProjectV2ItemFieldValue(input: {
        projectId: "${safeProjectId}"
        itemId: "${safeItemId}"
        fieldId: "${safeFieldId}"
        ${valueString}
      }) {
        projectV2Item {
          id
        }
      }
    }
  `;

  const response = await graphqlRequest(mutation);
  return (response as any).updateProjectV2ItemFieldValue.projectV2Item;
}

/**
 * Delete a field from a GitHub Project (V2)
 * 
 * @param projectId ID of the project
 * @param fieldId ID of the field to delete
 * @returns Deleted field
 */
export async function deleteField(projectId: string, fieldId: string) {
  const safeProjectId = escapeGraphQLString(projectId);
  const safeFieldId = escapeGraphQLString(fieldId);
  
  const mutation = `
    mutation {
      deleteProjectV2Field(input: {
        projectId: "${safeProjectId}"
        fieldId: "${safeFieldId}"
      }) {
        deletedField {
          id
        }
      }
    }
  `;

  const response = await graphqlRequest(mutation);
  return (response as any).deleteProjectV2Field.deletedField;
} 