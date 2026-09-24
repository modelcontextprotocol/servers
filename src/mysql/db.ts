import mysql from "mysql2/promise";

let pool: mysql.Pool | undefined = undefined;

let resourceBaseUrl: URL | undefined = undefined;

export async function initializePool(connectionString: string) {
    const dbUser = process.env.MYSQL_USER;
    const dbPassword = process.env.MYSQL_PASSWORD;

    if (!dbUser || !dbPassword) {
        console.error(
            "Error: Environment variables MYSQL_USER and MYSQL_PASSWORD must be set.",
        );
        process.exit(1);
    }

    // Parse the connection string to extract host, port, database, and options
    // Expected format: mysql://host:port/dbname?options or host:port/dbname?options
    let host: string;
    let port: number;
    let database: string;
    let connectionOptions: Record<string, any> = {};

    try {
        // Try parsing as URL first
        if (connectionString.startsWith('mysql://')) {
            const url = new URL(connectionString);
            host = url.hostname;
            port = url.port ? parseInt(url.port) : 3306;
            database = url.pathname.slice(1); // Remove leading '/'

            // Parse query parameters for connection options
            url.searchParams.forEach((value, key) => {
                // Convert string values to appropriate types
                if (value === 'true' || value === 'false') {
                    connectionOptions[key] = value === 'true';
                } else if (!isNaN(Number(value))) {
                    connectionOptions[key] = Number(value);
                } else {
                    connectionOptions[key] = value;
                }
            });
        } else {
            // Parse format: host:port/dbname or host:port/dbname?options
            const [baseConnection, queryString] = connectionString.split('?');
            const match = baseConnection.match(/^([^:]+):(\d+)\/(.+)$/);
            if (!match) {
                throw new Error("Invalid connection string format. Expected: host:port/dbname?options or mysql://host:port/dbname?options");
            }
            host = match[1];
            port = parseInt(match[2]);
            database = match[3];

            // Parse query string if present
            if (queryString) {
                const params = new URLSearchParams(queryString);
                params.forEach((value, key) => {
                    // Convert string values to appropriate types
                    if (value === 'true' || value === 'false') {
                        connectionOptions[key] = value === 'true';
                    } else if (!isNaN(Number(value))) {
                        connectionOptions[key] = Number(value);
                    } else {
                        connectionOptions[key] = value;
                    }
                });
            }
        }
    } catch (err) {
        console.error("Error parsing connection string:", err);
        process.exit(1);
    }

    // Handle special SSL option conversion
    // ssl=0 or ssl=false means disable SSL
    // ssl=1 or ssl=true means enable SSL with default settings (accepting self-signed certs)
    if ('ssl' in connectionOptions) {
        if (connectionOptions.ssl === 0 || connectionOptions.ssl === false) {
            connectionOptions.ssl = false;
        } else if (connectionOptions.ssl === 1 || connectionOptions.ssl === true) {
            // MySQL2 requires ssl to be an object, not a boolean
            connectionOptions.ssl = {
                rejectUnauthorized: false // Accept self-signed certificates
            };
        }
        // If ssl is already an object or string (like a path), keep it as is
    }

    pool = mysql.createPool({
        user: dbUser,
        password: dbPassword,
        host,
        port,
        database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        ...connectionOptions, // Spread connection options from URL
    });

    // Test connection
    const connection = await pool.getConnection();
    connection.release();

    // Build resource base URL without credentials
    const url = new URL(`mysql://${database}`);
    resourceBaseUrl = url;
}

export function isPoolInitialized(): boolean {
    return pool !== undefined;
}

export function getPool(): mysql.Pool {
    if (!pool) {
        throw new Error("MySQL connection pool not initialized. Use mysql-connect tool first.");
    }
    return pool;
}

export function getResourceBaseUrl(): URL {
    if (!resourceBaseUrl) {
        throw new Error("Resource Base URL not initialized. Use mysql-connect tool first.");
    }
    return resourceBaseUrl;
}

export async function withConnection<T>(callback: (connection: mysql.PoolConnection) => Promise<T>): Promise<T> {
    const pool = getPool();
    const connection = await pool.getConnection();
    try {
        return await callback(connection);
    } finally {
        connection.release();
    }
}

export async function closePool() {
    if (pool) {
        await pool.end();
        pool = undefined;
    }
}
