import oracledb from "oracledb";

let pool: oracledb.Pool | undefined = undefined;
let thickModeInitialized = false;

export async function initializePool(connectionString: string) {
  const dbUser = process.env.ORACLE_USER;
  const dbPassword = process.env.ORACLE_PASSWORD;

  if (!dbUser || !dbPassword) {
    console.error(
      "Error: Environment variables ORACLE_USER and ORACLE_PASSWORD must be set.",
    );
    process.exit(1);
  }

  // Initialize thick mode if not already done
  // This is required for databases that use Advanced Networking Option (ANO)
  // encryption and data integrity features
  if (!thickModeInitialized) {
    try {
      // Try to initialize thick mode with explicit library path
      // This may fail if Oracle Instant Client is not installed, but will
      // fall back to thin mode for databases that don't require encryption
      const libDir = process.env.LD_LIBRARY_PATH || '/usr/lib/instantclient';
      oracledb.initOracleClient({ libDir });
      thickModeInitialized = true;
      //console.log(`Oracle thick mode initialized successfully with libDir: ${libDir}`);
    } catch (err) {
      // If thick mode initialization fails, continue with thin mode
      // This will work for databases that don't require ANO
      console.warn("Could not initialize Oracle thick mode:", err);
      console.warn("Continuing in thin mode (may not work with encrypted connections)");
    }
  }

  try {
    pool = await oracledb.createPool({
      user: dbUser,
      password: dbPassword,
      connectionString,
      poolMin: 4,
      poolMax: 10,
      poolIncrement: 1,
      queueTimeout: 60000,
    });
  } catch (err) {
    console.error("connectionString:", connectionString);
    console.error("Error initializing connection pool:", err);
    process.exit(1);
  }
}

export function isPoolInitialized(): boolean {
  return pool !== undefined;
}

export function getPool(): oracledb.Pool {
  if (!pool) {
    throw new Error("Oracle connection pool not initialized. Use orcl-connect tool first.");
  }
  return pool;
}

export async function withConnection<T>(callback: (connection: oracledb.Connection) => Promise<T>): Promise<T> {
  const pool = getPool();
  let connection: oracledb.Connection | undefined;
  try {
    connection = await pool.getConnection();
    return await callback(connection);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error("Error closing Oracle connection:", err);
      }
    }
  }
}

export function getPoolStatus(): string {
  if (!pool) {
    return "Pool not initialized";
  }
  return `Pool created with ${pool.poolMin} min, ${pool.poolMax} max connections. Connections open: ${pool.connectionsOpen}, in use: ${pool.connectionsInUse}.`;
}

export async function closePool() {
  if (pool) {
    try {
      await pool.close(0);
      pool = undefined;
    } catch (err) {
      console.error("Error closing pool:", err);
    }
  }
}
