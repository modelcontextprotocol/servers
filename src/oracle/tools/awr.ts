import { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { withConnection } from "../db.js";
import oracledb from "oracledb";

export const awrHandler = async (request: CallToolRequest) => {
    try {
        return await withConnection(async (connection) => {
            // Step 1: Get dbid
            const dbidResult = await connection.execute<{ DBID: number }>
                (`SELECT dbid FROM v$database`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT })
            const dbid = dbidResult.rows?.[0]?.DBID;
            if (!dbid) {
                return {
                    content: [{ type: "text", text: "Could not retrieve DBID from v$database." }],
                    isError: true,
                };
            }
            // Step 2: Get begin_snap_id and end_snap_id
            const snapResult = await connection.execute<{
                BEGIN_SNAP_ID: number;
                END_SNAP_ID: number;
            }>(
                `WITH multi_instance_snaps AS (
                    SELECT snap_id
                    FROM dba_hist_snapshot
                    GROUP BY snap_id
                    HAVING COUNT(*) > 1
                  ),
                  recent_snaps AS (
                    SELECT snap_id
                    FROM multi_instance_snaps
                    ORDER BY snap_id DESC
                    FETCH FIRST 2 ROWS ONLY
                  )
                  SELECT
                    MIN(s1.snap_id) AS begin_snap_id,
                    MAX(s2.snap_id) AS end_snap_id,
                    s1.startup_time
                  FROM
                    dba_hist_snapshot s1
                  JOIN
                    dba_hist_snapshot s2
                      ON s1.startup_time = s2.startup_time
                     AND s1.snap_id < s2.snap_id
                  WHERE
                    s1.snap_id IN (SELECT snap_id FROM recent_snaps)
                    AND s2.snap_id IN (SELECT snap_id FROM recent_snaps)
                    AND s1.begin_interval_time >= SYSDATE - 1
                    AND s2.begin_interval_time >= SYSDATE - 1
                  GROUP BY s1.startup_time
                  ORDER BY end_snap_id DESC
                  FETCH FIRST 1 ROW ONLY`,
                [],
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            const begin_snap_id = snapResult.rows?.[0]?.BEGIN_SNAP_ID;
            const end_snap_id = snapResult.rows?.[0]?.END_SNAP_ID;
            if (!begin_snap_id || !end_snap_id) {
                return {
                    content: [{ type: "text", text: "Could not retrieve snapshot IDs." }],
                    isError: true,
                };
            }
            // Step 3: Generate AWR report
            const sql_id = request.params.arguments?.sql_id;
            let awrResult;
            if (!sql_id) {
                awrResult = await connection.execute(
                    `SELECT output FROM TABLE(dbms_workload_repository.awr_report_text(:dbid, 1, :begin_snap_id, :end_snap_id))`,
                    [dbid, begin_snap_id, end_snap_id],
                    { outFormat: oracledb.OUT_FORMAT_OBJECT } 
                );
            } else {
                awrResult = await connection.execute(
                    `SELECT output FROM TABLE(dbms_workload_repository.awr_sql_report_text(:dbid, 1, :begin_snap_id, :end_snap_id, :sql_id))`,
                    [dbid, begin_snap_id, end_snap_id, sql_id],
                    { outFormat: oracledb.OUT_FORMAT_OBJECT }
                );
            }
            // The report is a multi-row text output, concatenate all rows
            const reportText = awrResult.rows?.map((r: any) => r.OUTPUT).join("\n") ?? "No report output.";
            return {
                content: [{ type: "text", text: reportText }],
                isError: false,
            };
        });
    } catch (error: any) {
        return {
            content: [{ type: "text", text: `Error generating AWR report: ${error?.message ?? error}` }],
            isError: true,
        };
    }
};
