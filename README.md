# DevPass MCP Server (`@devpass/mcp`)

Unified Model Context Protocol (MCP) server for the **DevPass** developer ecosystem.

Connect your AI coding agents in **Cursor**, **Claude Code**, **Windsurf**, and **Cline** to manage:
- **RunPort** — instant reverse SSH tunnels to expose localhost with HTTPS and visual review mode.
- **Submito** — forms backend and lead intake endpoints without writing server-side code.
- **RunGate** — AI DNS (DoH) for direct access without VPN and unified AI Gateway proxy to LLMs.
- **RunPing** — uptime, keyword, JSON, TCP, and SSL certificate monitoring with public status pages.
- **Adopto** — user lifecycle event tracking and automated onboarding email sequences.
- **RunDeploy** — instant static/SPA/serverless hosting, atomic releases, custom domains, and encrypted env variables.
- **Answero** — AI + Telegram support chat widget, FAQ knowledge base, and live operator replies.

---

## Quick Start

### 1. Get your Master Token
Log in to your account at [id.devpass.ru](https://id.devpass.ru) and copy your **DEVPASS_TOKEN** (`dp_live_...`).

### 2. Configure your AI client

#### Cursor (`.cursor/mcp.json`)
Add the following to your project's `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "devpass": {
      "command": "npx",
      "args": ["-y", "@devpass/mcp"],
      "env": {
        "DEVPASS_TOKEN": "dp_live_your_actual_token_here"
      }
    }
  }
}
```

#### Claude Code (Terminal)
Run in your shell:
```bash
claude mcp add devpass npx -y @devpass/mcp --env DEVPASS_TOKEN="dp_live_your_actual_token_here"
```

#### Windsurf (`~/.codeium/windsurf/mcp_config.json`)
```json
{
  "mcpServers": {
    "devpass": {
      "command": "npx",
      "args": ["-y", "@devpass/mcp"],
      "env": {
        "DEVPASS_TOKEN": "dp_live_your_actual_token_here"
      }
    }
  }
}
```

---

## Available Tools

### Account & Subscription
* **`devpass_status`**: Inspect account status, active plan (Free / DevPass Pro), and service quotas.

### RunPort (Localhost Tunnels)
* **`runport_start_tunnel`**: Open a secure reverse tunnel for a local port (e.g. `3000`). Supports custom subdomains and visual client review mode (`review: true`).
* **`runport_stop_tunnel`**: Stop an active tunnel by subdomain.
* **`runport_get_logs`**: Retrieve recent HTTP traffic logs for debugging webhooks.
* **`runport_list_reviews`**: Fetch client review annotations left on the preview site.
* **`runport_resolve_review`**: Mark feedback comments as resolved after completing code changes.

### Submito (Forms & Lead Capture)
* **`submito_create_form`**: Provision a new form endpoint with Telegram alerts and owner email notifications.
* **`submito_get_snippet`**: Generate ready-to-paste form code for HTML, React, or Astro.
* **`submito_list_forms`**: List active forms and submission stats.

### RunGate (Smart DNS & AI Gateway)
* **`rungate_get_gateway_config`**: Get OpenAI-compatible baseUrl (`https://gateway.rungate.ru/v1`) and auth headers to call models (Claude, GPT-4o, DeepSeek) through RunGate.
* **`rungate_check_dns`**: Get OS-specific instructions for configuring DNS-over-HTTPS (DoH).

### RunPing (Uptime, SSL & Status Pages)
* **`runping_list_monitors`**: List all uptime & SSL monitors with status, 24h/30d uptime, latency, and SSL expiration days.
* **`runping_create_monitor`**: Create a new HTTP(S), keyword, JSON, or TCP port monitor with SSRF protection.
* **`runping_get_incidents`**: Fetch recent downtime incidents and failure causes across workspace monitors.
* **`runping_pause_monitor`**: Pause monitoring checks for a monitor by ID.
* **`runping_resume_monitor`**: Resume monitoring checks for a paused monitor by ID.
* **`runping_create_status_page`**: Create a public status page (`/s/:slug`) exposing selected monitors.

### Adopto (Behavioral Emails)
* **`adopto_track_event`**: Track user events (e.g. `signup`, `form_submitted`, `payment_completed`) to trigger or halt onboarding campaigns.
* **`adopto_list_sequences`**: List configured email sequences.

### RunDeploy (Hosting & Releases)
* **`rundeploy_list_projects`**: List projects with production URLs, active deployments, and custom domains.
* **`rundeploy_create_project`**: Create a new project with a `*.rundeploy.ru` subdomain.
* **`rundeploy_list_deployments`**: List deployment history and active release ID for a project.
* **`rundeploy_deploy_archive`**: Upload a local `.zip` or `.tar.gz` build archive and publish it atomically.
* **`rundeploy_rollback_deployment`**: Instantly roll back to a previous valid deployment.
* **`rundeploy_list_domains`**: List custom domains with DNS & SSL status.
* **`rundeploy_add_domain`**: Attach a custom domain to a project.
* **`rundeploy_verify_domain`**: Verify DNS records and trigger SSL certificate issuance.
* **`rundeploy_list_env`**: List configured environment variable keys.
* **`rundeploy_set_env`**: Create or update an encrypted environment variable.

### Answero (AI + Telegram Support Chat)
* **`answero_list_sites`**: List chat widget sites and plan limits.
* **`answero_create_site`**: Create a new chat widget site and get its `siteKey`.
* **`answero_get_widget_snippet`**: Generate the ready-to-paste `<script>` embed snippet for a site.
* **`answero_list_knowledge`**: List FAQ and knowledge base documents for a site.
* **`answero_add_knowledge`**: Add a FAQ, article, or raw text document for AI answers.
* **`answero_list_conversations`**: List support chat conversations with optional site/status filters.
* **`answero_get_conversation`**: Get full conversation details and message history.
* **`answero_reply_conversation`**: Send an operator reply into a conversation.
* **`answero_update_conversation_status`**: Update conversation status (`bot`, `waiting_operator`, `operator_active`, `closed`).

---

## Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `DEVPASS_TOKEN` | Master API token from `id.devpass.ru` (`dp_live_...`) | — |
| `DEVPASS_API_URL` | DevPass ID service endpoint | `https://id.devpass.ru` |
| `RUNPORT_DOMAIN` | Base domain for public tunnels | `runport.ru` |
| `SUBMITO_API_URL` | Submito API endpoint | `https://api.submito.ru` |
| `RUNGATE_GATEWAY_URL` | AI Gateway endpoint | `https://gateway.rungate.ru/v1` |
| `RUNPING_API_URL` | RunPing API endpoint | `https://runping.ru` |
| `ADOPTO_API_URL` | Adopto API endpoint | `https://api.adopto.ru` |
| `RUNDEPLOY_API_URL` | RunDeploy API endpoint | `https://rundeploy.ru` |
| `ANSWERO_API_URL` | Answero API endpoint | `https://answero.ru` |

---

## Development

```bash
git clone https://github.com/devpassru/mcp.git
cd mcp
npm install
npm run build
npm test
```

## Publishing to npm
The repository is configured for automated release publishing via GitHub Actions with npm OIDC (Trusted Publishing).

Alternatively, publish manually:
```bash
npm run build
npm publish --access public
```

---

## License
MIT
