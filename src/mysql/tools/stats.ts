import { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { withConnection } from "../db.js";

export const statsHandler = async (request: CallToolRequest) => {
    const tableName = request.params.arguments?.name as string;

    return await withConnection(async (connection) => {
        // Get table statistics
        const [tableStats] = await connection.query(`
            SELECT 
                TABLE_SCHEMA as schema_name,
                TABLE_NAME as table_name,
                TABLE_ROWS as num_rows,
                AVG_ROW_LENGTH as avg_row_length,
                DATA_LENGTH as data_length,
                INDEX_LENGTH as index_length,
                DATA_FREE as data_free,
                AUTO_INCREMENT as auto_increment,
                CREATE_TIME as create_time,
                UPDATE_TIME as update_time,
                CHECK_TIME as check_time,
                TABLE_COLLATION as collation,
                TABLE_COMMENT as comment
            FROM information_schema.TABLES
            WHERE TABLE_NAME = ? AND TABLE_SCHEMA = DATABASE()
        `, [tableName]);

        // Get index statistics
        const [indexStats] = await connection.query(`
            SELECT 
                INDEX_NAME as index_name,
                NON_UNIQUE as non_unique,
                SEQ_IN_INDEX as seq_in_index,
                COLUMN_NAME as column_name,
                COLLATION as collation,
                CARDINALITY as cardinality,
                INDEX_TYPE as index_type,
                COMMENT as comment
            FROM information_schema.STATISTICS
            WHERE TABLE_NAME = ? AND TABLE_SCHEMA = DATABASE()
            ORDER BY INDEX_NAME, SEQ_IN_INDEX
        `, [tableName]);

        // Get column statistics
        const [columnStats] = await connection.query(`
            SELECT 
                COLUMN_NAME as column_name,
                DATA_TYPE as data_type,
                IS_NULLABLE as is_nullable,
                COLUMN_DEFAULT as column_default,
                CHARACTER_MAXIMUM_LENGTH as max_length,
                NUMERIC_PRECISION as numeric_precision,
                NUMERIC_SCALE as numeric_scale,
                COLUMN_TYPE as column_type,
                COLUMN_KEY as column_key,
                EXTRA as extra,
                COLUMN_COMMENT as comment
            FROM information_schema.COLUMNS
            WHERE TABLE_NAME = ? AND TABLE_SCHEMA = DATABASE()
            ORDER BY ORDINAL_POSITION
        `, [tableName]);

        const stats = {
            table_stats: Array.isArray(tableStats) && tableStats.length > 0 ? tableStats[0] : null,
            index_stats: indexStats,
            column_stats: columnStats
        };

        return {
            content: [{ type: "text", text: JSON.stringify(stats, null, 2), mimeType: "application/json" }],
            isError: false,
        };
    });
};
