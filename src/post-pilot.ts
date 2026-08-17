import { Implementation } from "./index.js"

export const POST_PILOT: Implementation = {
  name: "post-pilot",
  source:
    "https://github.com/saksham-gagneja-indxx/Social-Media-Manager/tree/feat/mcp-deployment/mcp-server",
  description:
    "Control Post Pilot social media management from Claude — list reels, draft posts, suggest captions, schedule uploads, publish to LinkedIn. No UI switching needed.",
  homepage: "https://github.com/saksham-gagneja-indxx/Social-Media-Manager",
  repository: "https://github.com/saksham-gagneja-indxx/Social-Media-Manager",
  author: "saksham-gagneja-indxx",
  license: "MIT",
  contact: "sgagneja@indxx.com",
  tags: ["social-media", "linkedin", "posting", "ai-assistant", "content-scheduling", "automation"],
  setup_time_minutes: 15,
  requirements: ["cloudflare-account", "github-account", "post-pilot-backend-api"],
  type: "http",
  url: "https://post-pilot.reel-automation-mcp.workers.dev",
  authentication: "github-oauth",
}
