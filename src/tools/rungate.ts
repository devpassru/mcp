import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerRunGateTools(server: McpServer): void {
  server.registerTool(
    "rungate_get_gateway_config",
    {
      description:
        "Get setup configuration and endpoints for RunGate AI Gateway (OpenAI-compatible proxy for Claude Sonnet, GPT-4o, DeepSeek, and Gemini without VPN).",
      inputSchema: {
        model: z
          .string()
          .optional()
          .describe("Target model name (e.g. 'claude-3-7-sonnet', 'gpt-4o', 'deepseek-v3', 'gemini-2.5-pro')"),
      },
    },
    async ({ model }) => {
      const token = process.env.DEVPASS_TOKEN || "YOUR_DEVPASS_TOKEN";
      const gatewayUrl = process.env.RUNGATE_GATEWAY_URL || "https://gateway.rungate.ru/v1";
      const selectedModel = model || "claude-3-7-sonnet";

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                service: "RunGate AI Gateway",
                status: "active",
                baseUrl: gatewayUrl,
                apiKey: token.startsWith("dp_live_") ? `${token.slice(0, 10)}...${token.slice(-4)}` : "Set DEVPASS_TOKEN",
                recommendedModel: selectedModel,
                compatibleModels: [
                  "claude-3-7-sonnet",
                  "claude-3-5-sonnet",
                  "gpt-4o",
                  "gpt-4o-mini",
                  "deepseek-v3",
                  "deepseek-r1",
                  "gemini-2.5-pro",
                  "gemini-2.5-flash",
                ],
                usageExamples: {
                  curl: `curl ${gatewayUrl}/chat/completions \\\n  -H "Authorization: Bearer $DEVPASS_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model": "${selectedModel}", "messages": [{"role": "user", "content": "Hello world!"}]}'`,
                  openAiSdkJs: `import OpenAI from "openai";\n\nconst client = new OpenAI({\n  apiKey: process.env.DEVPASS_TOKEN,\n  baseURL: "${gatewayUrl}",\n});`,
                  python: `from openai import OpenAI\n\nclient = OpenAI(\n  api_key=os.environ.get("DEVPASS_TOKEN"),\n  base_url="${gatewayUrl}",\n)`,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "rungate_check_dns",
    {
      description:
        "Get setup instructions for RunGate Smart DNS (DoH / DNS-over-HTTPS) to access AI APIs and developer tools natively without VPN.",
      inputSchema: {
        os: z
          .enum(["macos", "windows", "linux", "ios", "android", "router"])
          .describe("Operating system or environment"),
      },
    },
    async ({ os }) => {
      const dohUrl = "https://dns.rungate.ru/dns-query";

      const guides: Record<string, string> = {
        macos:
          `RunGate Smart DNS on macOS:\n` +
          `1. Open System Settings → Network → Advanced → DNS.\n` +
          `2. Or install the RunGate MobileConfig profile from https://rungate.ru/download/macos.mobileconfig\n` +
          `3. DoH Server URL: ${dohUrl}\n` +
          `Now Claude Code, Cursor, and OpenAI CLI will route through RunGate automatically without system-wide VPN.`,
        windows:
          `RunGate Smart DNS on Windows 11:\n` +
          `1. Settings → Network & Internet → Wi-Fi / Ethernet → DNS server assignment → Edit.\n` +
          `2. Select Manual (IPv4) → enter Preferred DNS.\n` +
          `3. Enable DNS over HTTPS (DoH) template: ${dohUrl}`,
        linux:
          `RunGate Smart DNS on Linux (systemd-resolved):\n` +
          `Edit /etc/systemd/resolved.conf:\n` +
          `[Resolve]\n` +
          `DNS=185.196.220.14\n` +
          `DNSOverTLS=yes\n` +
          `Restart resolved: sudo systemctl restart systemd-resolved`,
        ios:
          `RunGate Smart DNS on iOS:\n` +
          `1. Download profile from https://rungate.ru/ios in Safari.\n` +
          `2. Settings → Profile Downloaded → Install.\n` +
          `3. Cellular & Wi-Fi will now use encrypted DoH via ${dohUrl}.`,
        android:
          `RunGate Smart DNS on Android:\n` +
          `Settings → Network & internet → Private DNS → Private DNS provider hostname: dns.rungate.ru`,
        router:
          `RunGate Smart DNS on Routers (Keenetic, OpenWrt, Mikrotik):\n` +
          `Configure DoH upstream upstream to: ${dohUrl}`,
      };

      return {
        content: [
          {
            type: "text",
            text: guides[os] || `RunGate DoH URL: ${dohUrl}`,
          },
        ],
      };
    }
  );
}
