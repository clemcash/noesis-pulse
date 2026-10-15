const WORKFLOW = "beta-feedback.yml";

export function githubRepo(): string {
  return process.env.NOESIS_GITHUB_REPO || "clemcash/intellect-lab";
}

/** Lance le workflow de génération de solutions sur le dépôt de Noesis. */
export async function dispatchSolutions(
  input: { brief: string; branch: string },
  opts: { fetchImpl?: typeof fetch; token?: string; repo?: string } = {},
): Promise<void> {
  const token = opts.token ?? process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) throw new Error("Variable d'environnement manquante : GITHUB_DISPATCH_TOKEN");
  const f = opts.fetchImpl ?? fetch;
  const res = await f(`https://api.github.com/repos/${opts.repo ?? githubRepo()}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", inputs: { brief: input.brief, branch: input.branch } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status !== 204) {
    let msg = "";
    try {
      msg = ((await res.json()) as { message?: string }).message ?? "";
    } catch {
      /* corps vide */
    }
    throw new Error(`GitHub ${res.status}${msg ? ` : ${msg}` : ""}`);
  }
}

/** Lien vers la pull request du lot (ou la recherche, tant qu'elle n'existe pas). */
export function batchLinks(branch: string): { pr: string; runs: string } {
  const repo = githubRepo();
  return {
    pr: `https://github.com/${repo}/pulls?q=${encodeURIComponent(`is:pr head:${branch}`)}`,
    runs: `https://github.com/${repo}/actions/workflows/${WORKFLOW}`,
  };
}
