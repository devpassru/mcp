import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerSubmitoTools(server: McpServer): void {
  server.registerTool(
    "submito_create_form",
    {
      description:
        "Create a new form endpoint in Submito for lead generation, waitlists, or feedback without writing custom backend code.",
      inputSchema: {
        name: z.string().describe("Form name (e.g. 'Waitlist', 'Contact Us', 'Bug Report')"),
        notify_email: z.string().email().optional().describe("Owner email address to receive submission notifications"),
        telegram_chat_id: z.string().optional().describe("Telegram Chat ID for real-time lead alerts"),
        redirect_url: z.string().url().optional().describe("Redirect URL for user after successful form submission"),
      },
    },
    async ({ name, notify_email, telegram_chat_id, redirect_url }) => {
      const token = process.env.DEVPASS_TOKEN;
      const apiUrl = process.env.SUBMITO_API_URL || "https://app.submito.ru";
      const workspaceId = process.env.SUBMITO_WORKSPACE_ID;

      if (!token) {
        return {
          isError: true,
          content: [{ type: "text", text: "DEVPASS_TOKEN is required to create a form in Submito." }],
        };
      }

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        };
        if (workspaceId) {
          headers["X-Workspace-Id"] = workspaceId;
        }

        const res = await fetch(`${apiUrl}/v1/forms`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            name,
            notify_email,
            telegram_chat_id,
            redirect_url,
          }),
        });

        if (!res.ok) {
          const errorText = await res.text().catch(() => "");
          return {
            isError: true,
            content: [{ type: "text", text: `Submito API error (${res.status}): ${errorText}` }],
          };
        }

        const data = (await res.json()) as { form_id: string; access_key: string; endpoint?: string };
        const submitEndpoint = `${apiUrl}/v1/submit`;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "created",
                  form_id: data.form_id,
                  access_key: data.access_key,
                  endpoint_url: submitEndpoint,
                  quick_start_html: `<form action="${submitEndpoint}" method="POST">\n  <input type="hidden" name="access_key" value="${data.access_key}" />\n  <input type="email" name="email" required placeholder="your@email.com" />\n  <button type="submit">Submit</button>\n</form>`,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to reach Submito API: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "submito_get_snippet",
    {
      description: "Get copy-paste integration snippet for a Submito form in HTML, React, or Astro.",
      inputSchema: {
        access_key: z.string().describe("Submito form access_key or public identifier"),
        framework: z.enum(["html", "react", "astro"]).describe("Frontend framework/format"),
      },
    },
    async ({ access_key, framework }) => {
      const apiUrl = process.env.SUBMITO_API_URL || "https://app.submito.ru";
      const endpoint = `${apiUrl}/v1/submit`;

      let code = "";
      if (framework === "html") {
        code = `<form action="${endpoint}" method="POST" class="space-y-4">\n  <input type="hidden" name="access_key" value="${access_key}" />\n  <div>\n    <label for="email">Email</label>\n    <input type="email" id="email" name="email" required />\n  </div>\n  <button type="submit">Send</button>\n</form>`;
      } else if (framework === "react") {
        code = `import { useState } from "react";\n\nexport function ContactForm() {\n  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");\n\n  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {\n    e.preventDefault();\n    setStatus("sending");\n    const formData = new FormData(e.currentTarget);\n    formData.set("access_key", "${access_key}");\n    const res = await fetch("${endpoint}", {\n      method: "POST",\n      body: formData,\n      headers: { Accept: "application/json" },\n    });\n    if (res.ok) setStatus("success");\n    else setStatus("error");\n  }\n\n  if (status === "success") return <p>Thank you! Your request was received.</p>;\n\n  return (\n    <form onSubmit={handleSubmit}>\n      <input type="email" name="email" required placeholder="name@company.com" />\n      <button type="submit" disabled={status === "sending"}>Submit</button>\n    </form>\n  );\n}`;
      } else if (framework === "astro") {
        code = `---\n// Astro Component\n---\n<form action="${endpoint}" method="POST" class="form-container">\n  <input type="hidden" name="access_key" value="${access_key}" />\n  <label>\n    Email\n    <input type="email" name="email" required placeholder="your@email.com" />\n  </label>\n  <button type="submit">Submit</button>\n</form>`;
      }

      return {
        content: [
          {
            type: "text",
            text: code,
          },
        ],
      };
    }
  );

  server.registerTool(
    "submito_list_forms",
    {
      description: "List all forms associated with the current DevPass / Submito account.",
      inputSchema: {
        offset: z.number().int().min(0).optional().describe("Pagination offset (default 0)"),
      },
    },
    async ({ offset = 0 }) => {
      const token = process.env.DEVPASS_TOKEN;
      const apiUrl = process.env.SUBMITO_API_URL || "https://app.submito.ru";

      if (!token) {
        return {
          isError: true,
          content: [{ type: "text", text: "DEVPASS_TOKEN is required to list Submito forms." }],
        };
      }

      try {
        const res = await fetch(`${apiUrl}/v1/forms?offset=${offset}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const errorText = await res.text().catch(() => "");
          return {
            isError: true,
            content: [{ type: "text", text: `Submito API error (${res.status}): ${errorText}` }],
          };
        }
        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to reach Submito API: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );
}
