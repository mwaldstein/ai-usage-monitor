import type { AIProvider } from "../../types";

export interface ProviderConfig {
  value: AIProvider;
  label: string;
  color: string;
}

export interface ProviderInstructions {
  apiKeyLabel: string;
  apiKeyPlaceholder: string;
  apiKeyHelp: string;
  bearerTokenLabel?: string;
  bearerTokenPlaceholder?: string;
  bearerTokenHelp?: string;
  baseUrlHelp?: string;
  baseUrlPlaceholder?: string;
  showBaseUrl: boolean;
  instructions: {
    title: string;
    steps: string[];
    link?: { text: string; url: string };
  };
}

export const PROVIDERS: ProviderConfig[] = [
  { value: "codex", label: "OpenAI Codex", color: "#10a37f" },
  { value: "opencode", label: "opencode zen", color: "#8b5cf6" },
  { value: "amp", label: "AMP", color: "#06b6d4" },
  { value: "zai", label: "z.ai", color: "#10b981" },
  { value: "claude", label: "Claude", color: "#d97757" },
];

export const PROVIDER_INSTRUCTIONS: Record<AIProvider, ProviderInstructions> = {
  opencode: {
    apiKeyLabel: "Auth Cookie",
    apiKeyPlaceholder: "auth=Fe26.2**...",
    apiKeyHelp: "Required: Copy full cookie string from browser",
    baseUrlHelp: "Required: Full workspace billing URL",
    baseUrlPlaceholder: "https://opencode.ai/workspace/wrk_...",
    showBaseUrl: true,
    instructions: {
      title: "How to get your OpenCode Auth Cookie",
      steps: [
        "Open https://opencode.ai in your browser",
        "Log in to your account",
        "Navigate to your workspace billing page",
        "Open DevTools (F12) → Application → Cookies",
        'Find the cookie named "auth"',
        'Copy the ENTIRE cookie string (including "auth=")',
        "Paste it in the field above",
        "For Base URL: Copy your workspace billing page URL",
      ],
      link: { text: "Open OpenCode", url: "https://opencode.ai" },
    },
  },
  amp: {
    apiKeyLabel: "Session Cookie",
    apiKeyPlaceholder: "session=...",
    apiKeyHelp: "Required: Copy full cookie string from browser",
    baseUrlHelp: "Optional: defaults to https://ampcode.com",
    baseUrlPlaceholder: "https://ampcode.com",
    showBaseUrl: true,
    instructions: {
      title: "How to get your AMP Session Cookie",
      steps: [
        "Open https://ampcode.com in your browser",
        "Log in to your account",
        "Open DevTools (F12) → Application → Cookies",
        "Find the session cookie (or auth cookie)",
        'Copy the ENTIRE cookie string (including the name, e.g., "session=")',
        "Paste it in the field above",
      ],
      link: { text: "Open AMP", url: "https://ampcode.com" },
    },
  },
  codex: {
    apiKeyLabel: "Session Cookie (Optional)",
    apiKeyPlaceholder: "hs_c=...",
    apiKeyHelp: "Legacy: Session cookie from chatgpt.com",
    bearerTokenLabel: "Bearer Token (Recommended)",
    bearerTokenPlaceholder: "eyJhbGciOiJSUzI1NiIs...",
    bearerTokenHelp: "JWT token from browser. Raw token or full 'Bearer ...' both accepted",
    showBaseUrl: false,
    instructions: {
      title: "How to get your ChatGPT Bearer Token",
      steps: [
        "Open https://chatgpt.com in your browser",
        "Log in to your account",
        "Open DevTools (F12) → Network tab",
        "Navigate to https://chatgpt.com/codex/settings/usage",
        "Look for the request to /backend-api/wham/usage",
        "Click on it → Headers → Request Headers",
        'Find the "Authorization: Bearer" header',
        'Copy the token (the long string after "Bearer ")',
        "Paste it in the Bearer Token field above",
      ],
      link: { text: "Open ChatGPT", url: "https://chatgpt.com" },
    },
  },
  zai: {
    apiKeyLabel: "Legacy Token (Optional)",
    apiKeyPlaceholder: "eyJ...",
    apiKeyHelp: "Backward compatibility only. Prefer Bearer Token field below",
    bearerTokenLabel: "Bearer Token (Recommended)",
    bearerTokenPlaceholder: "eyJhbGciOi...",
    bearerTokenHelp: "JWT token from localStorage. Raw token or full 'Bearer ...' both accepted",
    showBaseUrl: false,
    instructions: {
      title: "How to get your z.ai Bearer Token",
      steps: [
        "Open https://z.ai in your browser",
        "Log in to your account",
        "Open DevTools (F12) → Application → Local Storage",
        "Look for key: z-ai-open-platform-token-production or z-ai-website-token",
        "Copy the token value",
        "Paste it in the field above",
      ],
      link: { text: "Open z.ai", url: "https://z.ai" },
    },
  },
  claude: {
    apiKeyLabel: "Access Token",
    apiKeyPlaceholder: "sk-ant-oat01-...",
    apiKeyHelp: "Required: OAuth access token from ~/.claude/.credentials.json",
    bearerTokenLabel: "Refresh Token",
    bearerTokenPlaceholder: "sk-ant-ort01-...",
    bearerTokenHelp:
      "Required: OAuth refresh token — used to automatically renew the access token",
    showBaseUrl: false,
    instructions: {
      title: "How to get your Claude OAuth tokens",
      steps: [
        "Install Claude Code CLI: npm install -g @anthropic-ai/claude-code",
        "Run: claude (and log in if prompted)",
        "On Linux/macOS: cat ~/.claude/.credentials.json",
        'Copy the "accessToken" value → paste into Access Token field',
        'Copy the "refreshToken" value → paste into Refresh Token field',
        "Tokens are auto-refreshed, so you only need to do this once",
      ],
      link: { text: "Get Claude Code", url: "https://claude.ai/download" },
    },
  },
};
