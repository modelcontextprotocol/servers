import { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { withConnection } from "../db.js";
import oracledb from "oracledb";

export const statsHandler = async (request: CallToolRequest) => {
  let owner = "UPPER(USER)";
  let table = request.params.arguments?.name as string;
  if (table.includes(".")) {
    const parts = table.split(".");
    owner = `'${parts[0].toUpperCase()}'`;
    table = parts[1];
  }

  return await withConnection(async (connection) => {
    const result = await connection.execute<{ STATS_JSON: string }>(`SELECT JSON_OBJECT(
            'table_stats' VALUE (
              SELECT JSON_OBJECT(
                'owner' VALUE owner,
                'table_name' VALUE table_name,
                'num_rows' VALUE num_rows,
                'blocks' VALUE blocks,
                'empty_blocks' VALUE empty_blocks,
                'avg_row_len' VALUE avg_row_len,
                'last_analyzed' VALUE TO_CHAR(last_analyzed, 'YYYY-MM-DD HH24:MI:SS')
              )
              FROM all_tab_statistics
              WHERE owner = ${owner} AND table_name = UPPER(:tableName)
            ),
            'index_stats' VALUE (
              SELECT JSON_ARRAYAGG(
                JSON_OBJECT(
                  'index_name' VALUE index_name,
                  'blevel' VALUE blevel,
                  'leaf_blocks' VALUE leaf_blocks,
                  'distinct_keys' VALUE distinct_keys,
                  'num_rows' VALUE num_rows,
                  'clustering_factor' VALUE clustering_factor,
                  'last_analyzed' VALUE TO_CHAR(last_analyzed, 'YYYY-MM-DD HH24:MI:SS')
                )
              )
              FROM all_ind_statistics
              WHERE table_owner = ${owner} AND table_name = UPPER(:tableName)
            ),
            'column_stats' VALUE (
              SELECT JSON_ARRAYAGG(
                JSON_OBJECT(
                  'column_name' VALUE column_name,
                  'num_distinct' VALUE num_distinct,
                  'density' VALUE density,
                  'histogram' VALUE histogram,
                  'last_analyzed' VALUE TO_CHAR(last_analyzed, 'YYYY-MM-DD HH24:MI:SS')
                )
              )
              FROM all_tab_col_statistics
              WHERE owner = ${owner} AND table_name = UPPER(:tableName)
            )
          ) AS stats_json
          FROM dual`, [table, table, table], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return {
      content: [{ type: "text", text: result.rows?.[0]?.STATS_JSON, mimeType: "application/json" }],
      isError: false,
    };
  });
};
