import { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { withConnection } from "../db.js";

export const awrHandler = async (request: CallToolRequest) => {
    try {
        return await withConnection(async (client) => {
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

            // Check if pg_stat_statements extension is available
            const extCheck = await client.query(`
                SELECT EXISTS (
                    SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
                ) as has_extension
            `);

            const hasPgStatStatements = extCheck.rows[0].has_extension;

            // 1. Database-wide statistics
            const dbStats = await client.query(`
                SELECT 
                    datname,
                    numbackends as active_connections,
                    xact_commit as transactions_committed,
                    xact_rollback as transactions_rolled_back,
                    blks_read as blocks_read,
                    blks_hit as blocks_hit,
                    CASE 
                        WHEN (blks_read + blks_hit) > 0 
                        THEN ROUND(100.0 * blks_hit / (blks_read + blks_hit), 2)
                        ELSE 0 
                    END as cache_hit_ratio,
                    tup_returned as tuples_returned,
                    tup_fetched as tuples_fetched,
                    tup_inserted as tuples_inserted,
                    tup_updated as tuples_updated,
                    tup_deleted as tuples_deleted,
                    conflicts,
                    temp_files,
                    temp_bytes,
                    deadlocks,
                    blk_read_time,
                    blk_write_time
                FROM pg_stat_database
                WHERE datname = current_database()
            `);
            report.database_statistics = dbStats.rows[0];

            // 2. Top queries by total time (if pg_stat_statements is available)
            if (hasPgStatStatements) {
                try {
                    const baseQuery = `
                        SELECT 
                            queryid,
                            LEFT(query, 100) as query_text,
                            calls,
                            ROUND(total_exec_time::numeric, 2) as total_time_ms,
                            ROUND(mean_exec_time::numeric, 2) as mean_time_ms,
                            ROUND(min_exec_time::numeric, 2) as min_time_ms,
                            ROUND(max_exec_time::numeric, 2) as max_time_ms,
                            ROUND(stddev_exec_time::numeric, 2) as stddev_time_ms,
                            rows as total_rows,
                            ROUND((100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0))::numeric, 2) as buffer_hit_ratio,
                            shared_blks_read,
                            shared_blks_hit,
                            shared_blks_dirtied,
                            shared_blks_written,
                            temp_blks_read,
                            temp_blks_written
                        FROM pg_stat_statements
                        WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
                    `;

                    // Top by Total Time
                    const topQueries = await client.query(`
                        ${baseQuery}
                        ORDER BY total_exec_time DESC
                        LIMIT 20
                    `);
                    report.top_queries = topQueries.rows;

                    // Top by CPU (Rows Processed)
                    const topCpuQueries = await client.query(`
                        ${baseQuery}
                        ORDER BY rows DESC
                        LIMIT 5
                    `);
                    report.top_queries_by_cpu = topCpuQueries.rows;

                    // Top by IO (Blocks Read + Written)
                    const topIoQueries = await client.query(`
                        ${baseQuery}
                        ORDER BY (shared_blks_read + shared_blks_written) DESC
                        LIMIT 5
                    `);
                    report.top_queries_by_io = topIoQueries.rows;

                } catch (error: any) {
                    report.top_queries_note = `pg_stat_statements extension exists but is not properly loaded. Error: ${error.message}. Add 'shared_preload_libraries = pg_stat_statements' to postgresql.conf and restart PostgreSQL.`;
                }
            } else {
                const note = "pg_stat_statements extension not available. Install with: CREATE EXTENSION pg_stat_statements;";
                report.top_queries_note = note;
                report.top_queries_by_cpu_note = note;
                report.top_queries_by_io_note = note;
            }

            // 3. Table statistics
            const tableStats = await client.query(`
                SELECT 
                    schemaname,
                    relname as table_name,
                    seq_scan,
                    seq_tup_read,
                    idx_scan,
                    idx_tup_fetch,
                    n_tup_ins as inserts,
                    n_tup_upd as updates,
                    n_tup_del as deletes,
                    n_tup_hot_upd as hot_updates,
                    n_live_tup as live_tuples,
                    n_dead_tup as dead_tuples,
                    ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_tuple_ratio,
                    last_vacuum,
                    last_autovacuum,
                    last_analyze,
                    last_autoanalyze,
                    vacuum_count,
                    autovacuum_count,
                    analyze_count,
                    autoanalyze_count
                FROM pg_stat_user_tables
                ORDER BY seq_scan + COALESCE(idx_scan, 0) DESC
                LIMIT 20
            `);
            report.table_statistics = tableStats.rows;

            // 4. Index statistics
            const indexStats = await client.query(`
                SELECT 
                    schemaname,
                    relname as table_name,
                    indexrelname as index_name,
                    idx_scan as index_scans,
                    idx_tup_read as tuples_read,
                    idx_tup_fetch as tuples_fetched,
                    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
                FROM pg_stat_user_indexes
                ORDER BY idx_scan DESC
                LIMIT 20
            `);
            report.index_statistics = indexStats.rows;

            // 5. Connection and activity info
            const connInfo = await client.query(`
                SELECT 
                    COUNT(*) as total_connections,
                    COUNT(*) FILTER (WHERE state = 'active') as active,
                    COUNT(*) FILTER (WHERE state = 'idle') as idle,
                    COUNT(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction,
                    COUNT(*) FILTER (WHERE wait_event_type IS NOT NULL) as waiting,
                    MAX(EXTRACT(EPOCH FROM (now() - query_start))) as longest_query_seconds,
                    MAX(EXTRACT(EPOCH FROM (now() - xact_start))) as longest_transaction_seconds
                FROM pg_stat_activity
                WHERE datname = current_database()
            `);
            report.connection_info = connInfo.rows[0];

            // 6. Background writer and checkpoint statistics
            // In PostgreSQL 17+, checkpoint stats moved to pg_stat_checkpointer
            // and buffer backend stats moved to pg_stat_io
            const versionResult = await client.query('SHOW server_version_num');
            const versionNum = parseInt(versionResult.rows[0].server_version_num);

            if (versionNum >= 170000) {
                // PostgreSQL 17+: Query multiple views
                const checkpointerStats = await client.query(`
                    SELECT 
                        num_timed as checkpoints_timed,
                        num_requested as checkpoints_requested,
                        write_time as checkpoint_write_time,
                        sync_time as checkpoint_sync_time,
                        buffers_written as buffers_checkpoint,
                        stats_reset
                    FROM pg_stat_checkpointer
                `);

                const bgWriterStats = await client.query(`
                    SELECT 
                        buffers_clean,
                        maxwritten_clean,
                        buffers_alloc
                    FROM pg_stat_bgwriter
                `);

                // Get backend buffer stats from pg_stat_io
                const ioStats = await client.query(`
                    SELECT 
                        SUM(reads) FILTER (WHERE backend_type = 'client backend') as buffers_backend_read,
                        SUM(writes) FILTER (WHERE backend_type = 'client backend') as buffers_backend_write,
                        SUM(fsyncs) FILTER (WHERE backend_type = 'client backend') as buffers_backend_fsync
                    FROM pg_stat_io
                `);

                report.bgwriter_statistics = {
                    ...checkpointerStats.rows[0],
                    ...bgWriterStats.rows[0],
                    ...ioStats.rows[0]
                };
            } else {
                // PostgreSQL < 17: Use pg_stat_bgwriter for everything
                const bgWriterStats = await client.query(`
                    SELECT 
                        checkpoints_timed,
                        checkpoints_req as checkpoints_requested,
                        checkpoint_write_time,
                        checkpoint_sync_time,
                        buffers_checkpoint,
                        buffers_clean,
                        maxwritten_clean,
                        buffers_backend,
                        buffers_backend_fsync,
                        buffers_alloc,
                        stats_reset
                    FROM pg_stat_bgwriter
                `);
                report.bgwriter_statistics = bgWriterStats.rows[0];
            }

            // 7. Unused indexes (potential optimization candidates)
            const unusedIndexes = await client.query(`
                SELECT 
                    schemaname,
                    relname as table_name,
                    indexrelname as index_name,
                    idx_scan as scans,
                    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
                FROM pg_stat_user_indexes
                WHERE idx_scan = 0
                    AND indexrelname NOT LIKE '%_pkey'
                ORDER BY pg_relation_size(indexrelid) DESC
                LIMIT 10
            `);
            report.unused_indexes = unusedIndexes.rows;

            // 8. Recommendations
            const recommendations: string[] = [];

            // Check cache hit ratio
            const cacheHitRatio = parseFloat(report.database_statistics.cache_hit_ratio || '0');
            if (cacheHitRatio < 99) {
                recommendations.push(`Buffer cache hit ratio is ${cacheHitRatio}%. Consider increasing shared_buffers.`);
            }

            // Check unused indexes
            if (report.unused_indexes && report.unused_indexes.length > 0) {
                recommendations.push(`Found ${report.unused_indexes.length} unused indexes. Consider removing them to improve write performance.`);
            }

            // Check dead tuples
            if (report.table_statistics) {
                const highDeadTuples = report.table_statistics.filter((t: any) => parseFloat(t.dead_tuple_ratio || '0') > 10);
                if (highDeadTuples.length > 0) {
                    recommendations.push(`${highDeadTuples.length} tables have >10% dead tuples. Check autovacuum settings.`);
                }
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
                text: `Error generating PostgreSQL performance report: ${error?.message ?? error}`
            }],
            isError: true,
        };
    }
};
