// ... rest of the file remains the same ...

async function validateBranch(owner: string, repo: string, branch: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
      {
        headers: {
          Authorization: `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "github-mcp-server",
        },
      }
    );
    return response.ok;
  } catch (error) {
    console.error(`Error validating branch ${branch}:`, error);
    return false;
  }
}

async function getCommitDifference(
  owner: string,
  repo: string,
  base: string,
  head: string
): Promise<{ ahead_by: number; behind_by: number }> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`,
    {
      headers: {
        Authorization: `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "github-mcp-server",
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      `Failed to compare branches: ${response.statusText}. Details: ${JSON.stringify(errorData)}`
    );
  }

  const comparison = await response.json();
  return {
    ahead_by: comparison.ahead_by,
    behind_by: comparison.behind_by,
  };
}

async function createPullRequest(
  owner: string,
  repo: string,
  options: z.infer<typeof CreatePullRequestOptionsSchema>
): Promise<z.infer<typeof GitHubPullRequestSchema>> {
  // 1. Validate base branch
  const baseExists = await validateBranch(owner, repo, options.base);
  if (!baseExists) {
    throw new Error(`Base branch '${options.base}' does not exist`);
  }

  // 2. Validate head branch
  const headExists = await validateBranch(owner, repo, options.head);
  if (!headExists) {
    throw new Error(`Head branch '${options.head}' does not exist`);
  }

  // 3. Check for commit differences
  const commitDiff = await getCommitDifference(
    owner,
    repo,
    options.base,
    options.head
  );
  if (!commitDiff.ahead_by) {
    throw new Error(
      `No new commits to merge from '${options.head}' into '${options.base}'`
    );
  }

  // 4. Create pull request with detailed error handling
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls`,
    {
      method: "POST",
      headers: {
        Authorization: `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "github-mcp-server",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: options.title,
        body: options.body,
        head: options.head,
        base: options.base,
        maintainer_can_modify: options.maintainer_can_modify ?? true,
        draft: options.draft ?? false,
      }),
    }
  );

  if (!response.ok) {
    let errorMessage = `GitHub API error: ${response.statusText}`;
    try {
      const errorData = await response.json();
      errorMessage += `. Details: ${JSON.stringify(errorData)}`;
    } catch (e) {
      console.error("Failed to parse error response:", e);
    }
    throw new Error(errorMessage);
  }

  console.error("Successfully created pull request");
  const pullRequest = await response.json();
  return GitHubPullRequestSchema.parse(pullRequest);
}

// ... rest of the file remains the same ...
