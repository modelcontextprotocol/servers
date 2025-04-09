export const BRAVE_API_KEY = process.env.BRAVE_API_KEY!;

export function checkEnvVariables() {
  if (!BRAVE_API_KEY) {
    console.error("Error: BRAVE_API_KEY environment variable is required");
    process.exit(1);
  }
}
