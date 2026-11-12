import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

function formatJsonResult(data: unknown, isError = false) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
    ...(isError ? { isError: true } : {}),
  };
}

async function rundeployRequest(
  path: string,
  init: { method?: string; body?: unknown; formData?: FormData; timeoutMs?: number } = {}
): Promise<ReturnType<typeof formatJsonResult>> {
  const token = process.env.DEVPASS_TOKEN;
  if (!token) {
    return formatJsonResult(
      {
        error: "DEVPASS_TOKEN is not set",
        hint: "Export DEVPASS_TOKEN=dp_live_... to authenticate with RunDeploy.",
      },
      true
    );
  }

  const baseUrl = (process.env.RUNDEPLOY_API_URL || "https://rundeploy.ru").replace(/\/+$/, "");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  let body: string | FormData | undefined;

  if (init.formData !== undefined) {
    body = init.formData;
  } else if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers,
      body,
      signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
    });

    const data = await res.json().catch(() => ({ status: res.status }));
    return formatJsonResult(data, !res.ok);
  } catch (err) {
    return formatJsonResult(
      {
        error: "Failed to reach RunDeploy API",
        detail: err instanceof Error ? err.message : String(err),
      },
      true
    );
  }
}

export function registerRunDeployTools(server: McpServer): void {
  server.registerTool(
    "rundeploy_list_projects",
    {
      description:
        "List all RunDeploy projects in the authenticated workspace with production URLs, active deployments, and custom domains.",
      inputSchema: {},
    },
    async () => rundeployRequest("/api/v1/projects")
  );

  server.registerTool(
    "rundeploy_create_project",
    {
      description:
        "Create a new RunDeploy project (static site, SPA, serverless, or container) with a *.rundeploy.ru subdomain.",
      inputSchema: {
        name: z.string().min(1).max(100).describe("Display name of the project"),
        slug: z
          .string()
          .min(3)
          .max(48)
          .regex(/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$/)
          .describe("Subdomain slug (3-48 chars, lowercase a-z, 0-9, hyphens)"),
        spaFallback: z
          .boolean()
          .optional()
          .describe("Serve index.html for unknown routes (default true)"),
        type: z
          .enum(["static", "serverless", "container"])
          .optional()
          .describe("Project runtime type (default static)"),
      },
    },
    async (args) => rundeployRequest("/api/v1/projects", { method: "POST", body: args })
  );

  server.registerTool(
    "rundeploy_list_deployments",
    {
      description: "List deployment history and active release ID for a RunDeploy project.",
      inputSchema: {
        project_id: z.string().min(1).describe("RunDeploy project ID (e.g. prj_...)"),
      },
    },
    async ({ project_id }) =>
      rundeployRequest(`/api/v1/projects/${encodeURIComponent(project_id)}/deployments`)
  );

  server.registerTool(
    "rundeploy_deploy_archive",
    {
      description:
        "Upload a local .zip or .tar.gz build archive and publish it atomically to a RunDeploy project.",
      inputSchema: {
        project_id: z.string().min(1).describe("RunDeploy project ID (e.g. prj_...)"),
        archive_path: z
          .string()
          .min(1)
          .describe("Absolute or relative path to the local .zip or .tar.gz build archive"),
        commit_sha: z.string().max(64).optional().describe("Optional Git commit SHA"),
        commit_message: z.string().max(500).optional().describe("Optional release note / commit message"),
      },
    },
    async ({ project_id, archive_path, commit_sha, commit_message }) => {
      let fileBuffer: Buffer;
      try {
        const info = await stat(archive_path);
        if (!info.isFile()) {
          return formatJsonResult({ error: `Path is not a file: ${archive_path}` }, true);
        }
        fileBuffer = await readFile(archive_path);
      } catch (err) {
        return formatJsonResult(
          {
            error: "Failed to read archive file",
            detail: err instanceof Error ? err.message : String(err),
          },
          true
        );
      }

      const filename = basename(archive_path);
      const mimeType = filename.endsWith(".zip") ? "application/zip" : "application/gzip";
      const formData = new FormData();
      formData.append("file", new Blob([new Uint8Array(fileBuffer)], { type: mimeType }), filename);
      formData.append("source", "mcp");
      if (commit_sha) formData.append("commitSha", commit_sha);
      if (commit_message) formData.append("commitMessage", commit_message);

      return rundeployRequest(
        `/api/v1/projects/${encodeURIComponent(project_id)}/deployments`,
        {
          method: "POST",
          formData,
          timeoutMs: 60_000,
        }
      );
    }
  );

  server.registerTool(
    "rundeploy_rollback_deployment",
    {
      description: "Instantly roll back a RunDeploy project to a previous valid deployment.",
      inputSchema: {
        project_id: z.string().min(1).describe("RunDeploy project ID"),
        deployment_id: z.string().min(1).describe("Target deployment ID to activate"),
      },
    },
    async ({ project_id, deployment_id }) =>
      rundeployRequest(
        `/api/v1/projects/${encodeURIComponent(project_id)}/deployments/${encodeURIComponent(deployment_id)}/rollback`,
        { method: "POST" }
      )
  );

  server.registerTool(
    "rundeploy_list_domains",
    {
      description: "List custom domains attached to a RunDeploy project with DNS & SSL status.",
      inputSchema: {
        project_id: z.string().min(1).describe("RunDeploy project ID"),
      },
    },
    async ({ project_id }) =>
      rundeployRequest(`/api/v1/projects/${encodeURIComponent(project_id)}/domains`)
  );

  server.registerTool(
    "rundeploy_add_domain",
    {
      description: "Attach a custom domain to a RunDeploy project (requires Pro / DevPass Pro).",
      inputSchema: {
        project_id: z.string().min(1).describe("RunDeploy project ID"),
        domain: z.string().min(3).max(253).describe("Custom domain name (e.g. app.example.com)"),
      },
    },
    async ({ project_id, domain }) =>
      rundeployRequest(`/api/v1/projects/${encodeURIComponent(project_id)}/domains`, {
        method: "POST",
        body: { domain },
      })
  );

  server.registerTool(
    "rundeploy_verify_domain",
    {
      description: "Verify DNS records for a custom domain and trigger SSL certificate issuance.",
      inputSchema: {
        project_id: z.string().min(1).describe("RunDeploy project ID"),
        domain_id: z.string().min(1).describe("Custom domain ID (e.g. dom_...)"),
      },
    },
    async ({ project_id, domain_id }) =>
      rundeployRequest(
        `/api/v1/projects/${encodeURIComponent(project_id)}/domains/${encodeURIComponent(domain_id)}/verify`,
        { method: "POST" }
      )
  );

  server.registerTool(
    "rundeploy_list_env",
    {
      description: "List environment variable keys configured for a RunDeploy project (values are never returned).",
      inputSchema: {
        project_id: z.string().min(1).describe("RunDeploy project ID"),
      },
    },
    async ({ project_id }) =>
      rundeployRequest(`/api/v1/projects/${encodeURIComponent(project_id)}/env`)
  );

  server.registerTool(
    "rundeploy_set_env",
    {
      description: "Create or update an encrypted environment variable for a RunDeploy project.",
      inputSchema: {
        project_id: z.string().min(1).describe("RunDeploy project ID"),
        key: z
          .string()
          .regex(/^[A-Z0-9_]{1,64}$/)
          .describe("Variable key (A-Z, 0-9, _)"),
        value: z.string().describe("Secret or configuration value"),
      },
    },
    async ({ project_id, key, value }) =>
      rundeployRequest(`/api/v1/projects/${encodeURIComponent(project_id)}/env`, {
        method: "POST",
        body: { key, value },
      })
  );

  server.registerTool(
    "rundeploy_list_deploy_tokens",
    {
      description:
        "List project-scoped CI/CD deploy tokens for a RunDeploy project (token secrets are never returned).",
      inputSchema: {
        project_id: z.string().min(1).describe("RunDeploy project ID"),
      },
    },
    async ({ project_id }) =>
      rundeployRequest(`/api/v1/projects/${encodeURIComponent(project_id)}/deploy-tokens`)
  );

  server.registerTool(
    "rundeploy_create_deploy_token",
    {
      description:
        "Create a project-scoped deploy token (rdp_...) for CI/CD. It can ONLY publish deployments to this single project and has no access to other projects or DevPass services. Save the returned plainTextToken immediately.",
      inputSchema: {
        project_id: z.string().min(1).describe("RunDeploy project ID"),
        name: z.string().min(1).max(80).describe("Human-readable token label (e.g. GitLab CI)"),
        expires_in_days: z
          .number()
          .int()
          .min(1)
          .max(3650)
          .optional()
          .describe("Optional expiration in days (omit for non-expiring token)"),
      },
    },
    async ({ project_id, name, expires_in_days }) =>
      rundeployRequest(`/api/v1/projects/${encodeURIComponent(project_id)}/deploy-tokens`, {
        method: "POST",
        body: {
          name,
          ...(expires_in_days !== undefined ? { expiresInDays: expires_in_days } : {}),
        },
      })
  );

  server.registerTool(
    "rundeploy_revoke_deploy_token",
    {
      description: "Revoke a project-scoped deploy token so it can no longer publish deployments.",
      inputSchema: {
        project_id: z.string().min(1).describe("RunDeploy project ID"),
        token_id: z.string().min(1).describe("Deploy token ID (e.g. dtok_...)"),
      },
    },
    async ({ project_id, token_id }) =>
      rundeployRequest(
        `/api/v1/projects/${encodeURIComponent(project_id)}/deploy-tokens/${encodeURIComponent(token_id)}`,
        { method: "DELETE" }
      )
  );
}
