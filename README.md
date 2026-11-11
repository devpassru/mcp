# DevPass MCP Server (`@devpass/mcp`)

Unified Model Context Protocol (MCP) server for the **DevPass** developer ecosystem.

Connect your AI coding agents in **Cursor**, **Claude Code**, **Windsurf**, and **Cline** to manage:
- **RunPort** — instant reverse SSH tunnels to expose localhost with HTTPS and visual review mode.
- **Submito** — forms backend and lead intake endpoints without writing server-side code.
- **RunGate** — AI DNS (DoH) for direct access without VPN and unified AI Gateway proxy to LLMs.
- **Adopto** — user lifecycle event tracking and automated onboarding email sequences.

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
* **`devpass_status`**: Inspect account status, active plan (DevPass Pro / Team), and service quotas.

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

### Adopto (Behavioral Emails)
* **`adopto_track_event`**: Track user events (e.g. `signup`, `form_submitted`, `payment_completed`) to trigger or halt onboarding campaigns.
* **`adopto_list_sequences`**: List configured email sequences.

---

## Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `DEVPASS_TOKEN` | Master API token from `id.devpass.ru` (`dp_live_...`) | — |
| `DEVPASS_API_URL` | DevPass ID service endpoint | `https://id.devpass.ru` |
| `RUNPORT_DOMAIN` | Base domain for public tunnels | `runport.ru` |
| `SUBMITO_API_URL` | Submito API endpoint | `https://api.submito.ru` |
| `RUNGATE_GATEWAY_URL` | AI Gateway endpoint | `https://gateway.rungate.ru/v1` |
| `ADOPTO_API_URL` | Adopto API endpoint | `https://api.adopto.ru` |

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
