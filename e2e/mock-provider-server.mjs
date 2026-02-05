import http from "http";

const portArg = Number.parseInt(process.argv[2] ?? "4010", 10);
const port = Number.isFinite(portArg) ? portArg : 4010;

const state = {
  totalUsageCents: 120,
  hardLimitUsd: 100,
  softLimitUsd: 80,
};

function writeJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);

  if (req.method === "GET" && url.pathname === "/health") {
    writeJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/dashboard/billing/usage") {
    writeJson(res, 200, { total_usage: state.totalUsageCents });
    return;
  }

  if (req.method === "GET" && url.pathname === "/dashboard/billing/subscription") {
    writeJson(res, 200, {
      hard_limit_usd: state.hardLimitUsd,
      soft_limit_usd: state.softLimitUsd,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/__admin/state") {
    writeJson(res, 200, state);
    return;
  }

  if (req.method === "POST" && url.pathname === "/__admin/state") {
    try {
      const payload = await parseBody(req);
      if (typeof payload.totalUsageCents === "number") {
        state.totalUsageCents = payload.totalUsageCents;
      }
      if (typeof payload.hardLimitUsd === "number") {
        state.hardLimitUsd = payload.hardLimitUsd;
      }
      if (typeof payload.softLimitUsd === "number") {
        state.softLimitUsd = payload.softLimitUsd;
      }
      writeJson(res, 200, state);
    } catch {
      writeJson(res, 400, { error: "Invalid JSON payload" });
    }
    return;
  }

  writeJson(res, 404, { error: `Unhandled route: ${req.method} ${url.pathname}` });
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Mock provider listening on http://127.0.0.1:${port}\n`);
});
