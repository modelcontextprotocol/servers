import { ListResourcesRequest, ReadResourceRequest } from "@modelcontextprotocol/sdk/types.js";
import { withConnection, isPoolInitialized } from "./db.js";

const SCHEMA_PATH = "schema";

export const listResourcesHandler = async (request: ListResourcesRequest) => {
    if (!isPoolInitialized()) {
        return { resources: [] };
    }
    return await withConnection(async (client) => {
        const result = await client.query(
            "SELECT table_name, table_schema FROM information_schema.tables WHERE table_schema NOT IN ('information_schema', 'pg_catalog')",
        );
        return {
            resources: result.rows.map((row: any) => ({
                uri: `postgres://${row.table_schema}/${row.table_name}/${SCHEMA_PATH}`,
                mimeType: "application/json",
                name: `"${row.table_schema}"."${row.table_name}" database schema`,
            })),
        };
    });
};

export const readResourceHandler = async (request: ReadResourceRequest) => {
    const resourceUrl = new URL(request.params.uri);

    const pathComponents = resourceUrl.pathname.split("/");
    const schema = pathComponents.pop();
    const tableName = pathComponents.pop();
    const schemaName = resourceUrl.hostname;

    if (schema !== SCHEMA_PATH) {
        throw new Error("Invalid resource URI");
    }

    return await withConnection(async (client) => {
        const columnsResult = await client.query(
            `SELECT 
                column_name, 
                data_type, 
                is_nullable, 
                column_default,
                character_maximum_length,
                numeric_precision,
                numeric_scale 
             FROM information_schema.columns 
             WHERE table_name = $1 AND table_schema = $2
             ORDER BY ordinal_position`,
            [tableName, schemaName],
        );

        const indexesResult = await client.query(
            `SELECT
                ix.relname as index_name,
                i.indisunique as is_unique,
                a.attname as column_name
            FROM
                pg_class t,
                pg_class ix,
                pg_index i,
                pg_attribute a,
                pg_namespace n
            WHERE
                t.oid = i.indrelid
                AND ix.oid = i.indexrelid
                AND a.attrelid = t.oid
                AND a.attnum = ANY(i.indkey)
                AND t.relkind = 'r'
                AND t.relname = $1
                AND n.oid = t.relnamespace
                AND n.nspname = $2
            ORDER BY
                ix.relname`,
            [tableName, schemaName]
        );

        return {
            contents: [
                {
                    uri: request.params.uri,
                    mimeType: "application/json",
                    text: JSON.stringify({
                        columns: columnsResult.rows,
                        indexes: indexesResult.rows
                    }, null, 2),
                },
            ],
        };
    });
};
