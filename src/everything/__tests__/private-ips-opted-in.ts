/**
 * Opts a test file in to fetching from loopback and other private addresses
 * (#5130), for suites whose fixtures listen on 127.0.0.1. Import it first,
 * before anything that loads the server: `gzip-file-as-resource` reads
 * `GZIP_ALLOW_PRIVATE_IPS` once, when its module is evaluated, and imports are
 * evaluated in order (vitest gives each test file its own module graph). The
 * variable is unset again when the file's tests are done.
 */
import { afterAll, vi } from "vitest";

vi.stubEnv("GZIP_ALLOW_PRIVATE_IPS", "1");
afterAll(() => {
  vi.unstubAllEnvs();
});
