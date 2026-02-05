declare global {
  interface Window {
    __AI_USAGE_QUOTA_BASE_PATH__?: string;
  }
}

let cachedBasePath: string | null = null;

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

function normalizeBasePath(basePath: string): string {
  const trimmed = (basePath || "").trim();
  if (!trimmed || trimmed === "/") return "";

  const ensuredLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const withoutTrailingSlash = ensuredLeadingSlash.endsWith("/")
    ? ensuredLeadingSlash.slice(0, -1)
    : ensuredLeadingSlash;

  return withoutTrailingSlash === "/" ? "" : withoutTrailingSlash;
}

function inferBasePathFromScriptSrc(): string | null {
  const scripts = Array.from(document.querySelectorAll("script[src]")) as HTMLScriptElement[];
  const srcPaths = scripts
    .map((s) => s.getAttribute("src"))
    .filter((src): src is string => Boolean(src))
    .map((src) => {
      try {
        return new URL(src, window.location.href).pathname;
      } catch {
        return null;
      }
    })
    .filter((p): p is string => Boolean(p));

  const preferred =
    srcPaths.find((p) => p.includes("/assets/")) ??
    srcPaths.find((p) => p.includes("/src/")) ??
    srcPaths[0];

  if (!preferred) return null;

  const markers = ["/assets/", "/src/"];
  for (const marker of markers) {
    const idx = preferred.indexOf(marker);
    if (idx >= 0) return normalizeBasePath(preferred.slice(0, idx));
  }

  // If we can't find a known marker, fall back to the directory the script lives in.
  // Example: /foo/bar/main.js -> /foo/bar
  const lastSlash = preferred.lastIndexOf("/");
  if (lastSlash <= 0) return "";
  return normalizeBasePath(preferred.slice(0, lastSlash));
}

export function getRuntimeBasePath(): string {
  if (cachedBasePath !== null) return cachedBasePath;

  // Explicit override (useful when a proxy can inject this as a global)
  if (typeof window.__AI_USAGE_QUOTA_BASE_PATH__ === "string") {
    cachedBasePath = normalizeBasePath(window.__AI_USAGE_QUOTA_BASE_PATH__);
    return cachedBasePath;
  }

  // Respect a <base href="..."> tag if present
  const baseEl = document.querySelector("base[href]") as HTMLBaseElement | null;
  if (baseEl) {
    const href = baseEl.getAttribute("href");
    if (href) {
      try {
        const url = new URL(href, window.location.href);
        if (url.origin === window.location.origin) {
          cachedBasePath = normalizeBasePath(url.pathname);
          return cachedBasePath;
        }
      } catch {
        // Ignore invalid base href
      }
    }
  }

  const fromScript = inferBasePathFromScriptSrc();
  if (fromScript !== null) {
    cachedBasePath = fromScript;
    return cachedBasePath;
  }

  // Fall back to root.
  cachedBasePath = "";
  return cachedBasePath;
}

function getBackendOrigin(): string {
  if (isProd()) return window.location.origin;
  return import.meta.env.VITE_BACKEND_ORIGIN || "http://localhost:3001";
}

export function getBackendBaseUrl(): string {
  const origin = getBackendOrigin();
  const basePath = isProd() ? getRuntimeBasePath() : "";
  return `${origin}${basePath}`;
}

export function getApiBaseUrl(): string {
  return `${getBackendBaseUrl()}/api`;
}

export function getVersionUrl(): string {
  return `${getBackendBaseUrl()}/version`;
}

export function getWebSocketUrl(): string {
  if (!isProd()) {
    const backendOrigin = getBackendOrigin();
    if (backendOrigin.startsWith("https://")) {
      return `wss://${backendOrigin.slice("https://".length)}/`;
    }
    if (backendOrigin.startsWith("http://")) {
      return `ws://${backendOrigin.slice("http://".length)}/`;
    }
    return "ws://localhost:3001/";
  }

  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const basePath = getRuntimeBasePath();
  const wsPath = basePath ? `${basePath}/` : "/";
  return `${wsProtocol}//${window.location.host}${wsPath}`;
}
