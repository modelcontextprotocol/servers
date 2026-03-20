import type { CorsOptions } from "cors";

const DEFAULT_LOOPBACK_ORIGIN_REGEX =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;

function getCorsOriginRegex(): RegExp {
  const raw = process.env.MCP_CORS_ORIGIN_REGEX;
  if (!raw) return DEFAULT_LOOPBACK_ORIGIN_REGEX;

  try {
    return new RegExp(raw);
  } catch (err) {
    // Fail fast with a clear message instead of silently allowing all origins.
    throw new Error(
      `Invalid MCP_CORS_ORIGIN_REGEX=${JSON.stringify(raw)}: ${String(err)}`
    );
  }
}

export function createCorsOptions(opts: {
  methods: string;
  exposedHeaders?: string[];
}): CorsOptions {
  const originRegex = getCorsOriginRegex();

  return {
    // Only allow loopback origins by default (Inspector direct connect).
    // Override via MCP_CORS_ORIGIN_REGEX if you intentionally need a wider allowlist.
    origin: (origin, callback) => {
      if (!origin) return callback(null, false);
      return callback(null, originRegex.test(origin));
    },
    methods: opts.methods,
    preflightContinue: false,
    optionsSuccessStatus: 204,
    ...(opts.exposedHeaders ? { exposedHeaders: opts.exposedHeaders } : {}),
  };
}
