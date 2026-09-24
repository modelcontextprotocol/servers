import { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { withConnection } from "../db.js";

export const awrHandler = async (request: CallToolRequest) => {
    try {
        return await withConnection(async (connection) => {
            const report: any = {
                timestamp: new Date().toISOString(),
                database_statistics: {},
                top_queries: [],
                top_queries_by_cpu: [],
                top_queries_by_io: [],
                table_statistics: [],
                index_statistics: [],
                connection_info: {},
            };

            // Check if performance_schema is enabled
            const [perfSchemaCheck] = await connection.query(`
                SELECT @@performance_schema as enabled
            `);
            const hasPerfSchema = (perfSchemaCheck as any)[0].enabled === 1;

            // 1. Database-wide statistics
            const [dbStats] = await connection.query(`
                SELECT 
                    DATABASE() as database_name,
                    @@version as mysql_version,
                    @@version_comment as version_comment,
                    @@innodb_buffer_pool_size as buffer_pool_size,
                    @@max_connections as max_connections,
                    @@table_open_cache as table_open_cache,
                    @@query_cache_type as query_cache_type,
                    @@query_cache_size as query_cache_size
            `);
            report.database_statistics = (dbStats as any)[0];

            // 2. InnoDB statistics
            const [innodbStats] = await connection.query(`
                SHOW GLOBAL STATUS WHERE 
                    Variable_name LIKE 'Innodb_buffer_pool%' OR
                    Variable_name LIKE 'Innodb_rows%' OR
                    Variable_name LIKE 'Innodb_data%' OR
                    Variable_name = 'Innodb_page_size'
            `);

            const innodbStatsObj: any = {};
            (innodbStats as any[]).forEach((row: any) => {
                innodbStatsObj[row.Variable_name] = row.Value;
            });
            report.innodb_statistics = innodbStatsObj;

            // Calculate buffer pool hit ratio
            const poolReads = parseInt(innodbStatsObj.Innodb_buffer_pool_reads || '0');
            const poolReadRequests = parseInt(innodbStatsObj.Innodb_buffer_pool_read_requests || '0');
            if (poolReadRequests > 0) {
                report.innodb_statistics.buffer_pool_hit_ratio =
                    ((poolReadRequests - poolReads) / poolReadRequests * 100).toFixed(2) + '%';
            }

            // 3. Top queries from performance_schema (if available)
            if (hasPerfSchema) {
                try {
                    const baseQuery = `
                        SELECT 
                            DIGEST_TEXT as query_text,
                            COUNT_STAR as exec_count,
                            ROUND(SUM_TIMER_WAIT / 1000000000000, 2) as total_time_sec,
                            ROUND(AVG_TIMER_WAIT / 1000000000000, 2) as avg_time_sec,
                            ROUND(MIN_TIMER_WAIT / 1000000000000, 2) as min_time_sec,
                            ROUND(MAX_TIMER_WAIT / 1000000000000, 2) as max_time_sec,
                            SUM_ROWS_EXAMINED as rows_examined,
                            SUM_ROWS_SENT as rows_sent,
                            SUM_ROWS_AFFECTED as rows_affected,
                            SUM_CREATED_TMP_TABLES as tmp_tables,
                            SUM_CREATED_TMP_DISK_TABLES as tmp_disk_tables,
                            SUM_SELECT_FULL_JOIN as full_joins,
                            SUM_SELECT_SCAN as full_scans,
                            SUM_SORT_MERGE_PASSES as sort_merge_passes,
                            SUM_NO_INDEX_USED as no_index_used,
                            SUM_NO_GOOD_INDEX_USED as no_good_index_used
                        FROM performance_schema.events_statements_summary_by_digest
                        WHERE SCHEMA_NAME = DATABASE()
                        AND DIGEST_TEXT NOT LIKE '%performance_schema%'
                        AND DIGEST_TEXT NOT LIKE '%information_schema%'
                    `;

                    // Top by Total Time
                    const [topQueries] = await connection.query(`
                        ${baseQuery}
                        ORDER BY SUM_TIMER_WAIT DESC
                        LIMIT 20
                    `);
                    report.top_queries = topQueries;

                    // Top by CPU (Rows Examined)
                    const [topCpuQueries] = await connection.query(`
                        ${baseQuery}
                        ORDER BY SUM_ROWS_EXAMINED DESC
                        LIMIT 5
                    `);
                    report.top_queries_by_cpu = topCpuQueries;

                    // Top by IO (Disk Temp Tables)
                    const [topIoQueries] = await connection.query(`
                        ${baseQuery}
                        ORDER BY SUM_CREATED_TMP_DISK_TABLES DESC
                        LIMIT 5
                    `);
                    report.top_queries_by_io = topIoQueries;

                } catch (error: any) {
                    report.top_queries_note = `Performance schema is enabled but query stats unavailable: ${error.message}`;
                }
            } else {
                const note = "Performance schema is not enabled. Set performance_schema=ON in my.cnf and restart MySQL.";
                report.top_queries_note = note;
                report.top_queries_by_cpu_note = note;
                report.top_queries_by_io_note = note;
            }

            // 4. Table statistics
            const [tableStats] = await connection.query(`
                SELECT 
                    TABLE_NAME as table_name,
                    ENGINE as engine,
                    TABLE_ROWS as estimated_rows,
                    AVG_ROW_LENGTH as avg_row_length,
                    ROUND(DATA_LENGTH / 1024 / 1024, 2) as data_size_mb,
                    ROUND(INDEX_LENGTH / 1024 / 1024, 2) as index_size_mb,
                    ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) as total_size_mb,
                    ROUND(DATA_FREE / 1024 / 1024, 2) as data_free_mb,
                    AUTO_INCREMENT as auto_increment,
                    CREATE_TIME as created,
                    UPDATE_TIME as last_updated,
                    CHECK_TIME as last_checked,
                    TABLE_COLLATION as collation
                FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE()
                    AND TABLE_TYPE = 'BASE TABLE'
                ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC
                LIMIT 20
            `);
            report.table_statistics = tableStats;

            // 5. Index statistics
            const [indexStats] = await connection.query(`
                SELECT 
                    TABLE_NAME as table_name,
                    INDEX_NAME as index_name,
                    NON_UNIQUE as non_unique,
                    COUNT(*) as column_count,
                    GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as columns,
                    INDEX_TYPE as index_type,
                    MAX(CARDINALITY) as cardinality
                FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE()
                GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE, INDEX_TYPE
                ORDER BY TABLE_NAME, INDEX_NAME
                LIMIT 50
            `);
            report.index_statistics = indexStats;

            // 6. Connection and thread info
            const [connInfo] = await connection.query(`
                SELECT 
                    COUNT(*) as total_connections,
                    SUM(CASE WHEN COMMAND != 'Sleep' THEN 1 ELSE 0 END) as active_connections,
                    SUM(CASE WHEN COMMAND = 'Sleep' THEN 1 ELSE 0 END) as sleeping_connections,
                    MAX(TIME) as longest_query_time_sec
                FROM information_schema.PROCESSLIST
            `);
            report.connection_info = (connInfo as any)[0];

            // 7. Global status variables
            const [globalStatus] = await connection.query(`
                SHOW GLOBAL STATUS WHERE 
                    Variable_name IN (
                        'Threads_connected', 'Threads_running', 'Threads_created',
                        'Connections', 'Aborted_connects', 'Aborted_clients',
                        'Queries', 'Questions', 'Slow_queries',
                        'Com_select', 'Com_insert', 'Com_update', 'Com_delete',
                        'Table_locks_immediate', 'Table_locks_waited',
                        'Created_tmp_tables', 'Created_tmp_disk_tables',
                        'Sort_merge_passes', 'Sort_scan', 'Sort_range',
                        'Opened_tables', 'Open_tables', 'Table_open_cache_hits', 'Table_open_cache_misses',
                        'Uptime', 'Uptime_since_flush_status'
                    )
            `);

            const globalStatusObj: any = {};
            (globalStatus as any[]).forEach((row: any) => {
                globalStatusObj[row.Variable_name] = row.Value;
            });
            report.global_status = globalStatusObj;

            // 8. Table cache hit ratio
            const cacheHits = parseInt(globalStatusObj.Table_open_cache_hits || '0');
            const cacheMisses = parseInt(globalStatusObj.Table_open_cache_misses || '0');
            if (cacheHits + cacheMisses > 0) {
                report.global_status.table_cache_hit_ratio =
                    (cacheHits / (cacheHits + cacheMisses) * 100).toFixed(2) + '%';
            }

            // 9. Recommendations
            const recommendations: string[] = [];

            // Check buffer pool hit ratio
            if (poolReadRequests > 0) {
                const hitRatio = (poolReadRequests - poolReads) / poolReadRequests * 100;
                if (hitRatio < 95) {
                    recommendations.push(`InnoDB buffer pool hit ratio is ${hitRatio.toFixed(2)}%. Consider increasing innodb_buffer_pool_size (currently ${innodbStatsObj.Innodb_buffer_pool_size} bytes).`);
                }
            }

            // Check tmp tables on disk
            const tmpTables = parseInt(globalStatusObj.Created_tmp_tables || '0');
            const tmpDiskTables = parseInt(globalStatusObj.Created_tmp_disk_tables || '0');
            if (tmpTables > 0 && tmpDiskTables / tmpTables > 0.25) {
                recommendations.push(`${(tmpDiskTables / tmpTables * 100).toFixed(2)}% of temporary tables are created on disk. Consider increasing tmp_table_size and max_heap_table_size.`);
            }

            // Check table cache
            if (cacheMisses > 0 && cacheHits / (cacheHits + cacheMisses) < 0.85) {
                recommendations.push(`Table cache hit ratio is low. Consider increasing table_open_cache (currently ${report.database_statistics.table_open_cache}).`);
            }

            // Check for slow queries
            const slowQueries = parseInt(globalStatusObj.Slow_queries || '0');
            const totalQueries = parseInt(globalStatusObj.Questions || '0');
            if (totalQueries > 0 && slowQueries / totalQueries > 0.05) {
                recommendations.push(`${(slowQueries / totalQueries * 100).toFixed(2)}% of queries are slow. Review slow query log and optimize queries.`);
            }

            report.recommendations = recommendations;

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(report, null, 2),
                    mimeType: "application/json"
                }],
                isError: false,
            };
        });
    } catch (error: any) {
        return {
            content: [{
                type: "text",
                text: `Error generating MySQL performance report: ${error?.message ?? error}`
            }],
            isError: true,
        };
    }
};
