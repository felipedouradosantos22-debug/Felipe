import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { request as httpRequest, type Server } from "node:http";
import {
  connectSiteAccount,
  disconnectSiteAccount,
  getSiteConnectionStatus,
  resetSiteConnectionStateForTests,
  testSiteConnection,
} from "../server/inventory/site-connection";
import { registerSiteConnectionRoutes } from "../server/inventory/site-connection-routes";
import { registerInventoryStockOutRoute } from "../server/_core/index";

const SITE_ORIGIN = "https://www.brazilhrproject.icu";
const originalFetch = globalThis.fetch;

type ExternalCall = {
  url: string;
  method: string;
  headers: Headers;
  body?: string;
};

type TestUser = {
  openId: string;
  role: string;
};

function jsonResponse(body: unknown, status = 200, setCookies: string[] = []): Response {
  const headers = new Headers({ "content-type": "application/json" });
  for (const cookie of setCookies) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

function htmlResponse(body: string, status = 200, setCookies: string[] = []): Response {
  const headers = new Headers({ "content-type": "text/html" });
  for (const cookie of setCookies) headers.append("set-cookie", cookie);
  return new Response(body, { status, headers });
}

function siteUser(username = "warehouse.user", role = "warehouse") {
  return {
    name: "Usuário Warehouse",
    username,
    role,
    must_change_password: false,
    access_scope: { stock: "visible", issue: "visible" },
  };
}

function installFetchMock(options: {
  username?: string;
  catalog?: { materials: unknown; lots: unknown; equipment: unknown };
  sessionBody?: unknown;
  loginResponse?: Response | (() => Response);
  sessionResponse?: Response | (() => Response);
  bootstrapResponse?: Response | (() => Response);
  cookieMaxAge?: number;
} = {}): { fetchMock: ReturnType<typeof vi.fn>; calls: ExternalCall[] } {
  const calls: ExternalCall[] = [];
  const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const call: ExternalCall = {
      url,
      method: init?.method ?? "GET",
      headers,
      ...(typeof init?.body === "string" ? { body: init.body } : {}),
    };
    calls.push(call);
    const maxAge = options.cookieMaxAge ?? 1800;
    if (url === `${SITE_ORIGIN}/login/`) {
      return htmlResponse(
        '<html><form><input type="hidden" name="csrfmiddlewaretoken" value="csrf-token"></form></html>',
        200,
        [`csrftoken=csrf-token; Path=/; Max-Age=${maxAge}`],
      );
    }
    if (url === `${SITE_ORIGIN}/api/login/`) {
      const response = options.loginResponse;
      return typeof response === "function"
        ? response()
        : response ?? jsonResponse({ ok: true }, 200, [`sessionid=session-${options.username ?? "warehouse.user"}; Path=/; Max-Age=${maxAge}`]);
    }
    if (url === `${SITE_ORIGIN}/api/session/`) {
      const response = options.sessionResponse;
      return typeof response === "function"
        ? response()
        : response ?? jsonResponse({ user: options.sessionBody ?? siteUser(options.username) });
    }
    if (url === `${SITE_ORIGIN}/api/bootstrap/?section=catalog`) {
      const response = options.bootstrapResponse;
      if (typeof response === "function") return response();
      if (response) return response;
      const catalog = options.catalog ?? { materials: [{ id: 1 }], lots: [{ id: 2 }], equipment: [{ id: 3 }] };
      return jsonResponse({ user: options.sessionBody ?? siteUser(options.username), ...catalog });
    }
    throw new Error(`unexpected external URL: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

async function listen(app: express.Express): Promise<{ server: Server; baseUrl: string }> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing test server address");
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function localRequest(
  baseUrl: string,
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; body: any; headers: Headers }> {
  const url = new URL(path, baseUrl);
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      url,
      {
        method: options.method ?? "GET",
        headers: {
          ...(body ? { "content-type": "application/json", "content-length": Buffer.byteLength(body) } : {}),
          ...options.headers,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let parsed: unknown = text;
          try {
            parsed = text ? JSON.parse(text) : null;
          } catch {
            // Keep non-JSON response text for diagnostics in the test.
          }
          resolve({ status: response.statusCode ?? 0, body: parsed, headers: new Headers(response.headers as HeadersInit) });
        });
      },
    );
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

function routeApp(users: Record<string, TestUser> = { "user-a": { openId: "user-a", role: "user" } }) {
  const app = express();
  app.use(express.json());
  registerSiteConnectionRoutes(app, {
    authenticateRequest: async (req) => {
      const openId = req.header("x-open-id");
      const user = openId ? users[openId] : undefined;
      if (!user) throw new Error("unauthenticated");
      return user;
    },
    hasOperatorAccess: (user) => user.role === "admin" || user.openId in users,
  });
  return app;
}

beforeEach(() => {
  resetSiteConnectionStateForTests();
  vi.useRealTimers();
});

afterEach(() => {
  resetSiteConnectionStateForTests();
  vi.unstubAllGlobals();
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

describe("cliente de conexão do Projeto Brasil — consulta isolada", () => {
  it("faz GET login, POST CSRF e apenas os dois GETs autenticados no happy path", async () => {
    const { calls } = installFetchMock();
    const status = await connectSiteAccount("user-a", {
      username: "warehouse.user",
      password: "secret-only-for-request",
    });

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      `GET ${SITE_ORIGIN}/login/`,
      `POST ${SITE_ORIGIN}/api/login/`,
      `GET ${SITE_ORIGIN}/api/session/`,
      `GET ${SITE_ORIGIN}/api/bootstrap/?section=catalog`,
    ]);
    expect(calls[1]?.headers.get("content-type")).toBe("application/json");
    expect(calls[1]?.headers.get("x-csrftoken")).toBe("csrf-token");
    expect(calls[1]?.headers.get("origin")).toBe(SITE_ORIGIN);
    expect(calls[1]?.headers.get("referer")).toBe(`${SITE_ORIGIN}/login/`);
    expect(calls[1]?.headers.get("cookie")).toContain("csrftoken=csrf-token");
    expect(calls[1]?.body).toBe(JSON.stringify({ username: "warehouse.user", password: "secret-only-for-request" }));
    expect(status).toMatchObject({
      connected: true,
      mode: "read_only",
      siteOrigin: SITE_ORIGIN,
      user: {
        name: "Usuário Warehouse",
        username: "warehouse.user",
        role: "warehouse",
        requiresApproval: true,
      },
      catalog: { materialCount: 1, lotCount: 1, equipmentCount: 1 },
    });
    expect(JSON.stringify(status)).not.toContain("secret-only-for-request");
    expect(JSON.stringify(status)).not.toContain("session-warehouse.user");
  });

  it("isola sessões e desconexão entre dois openIds", async () => {
    const { calls } = installFetchMock();
    const first = await connectSiteAccount("user-a", { username: "a", password: "a-password" });
    const second = await connectSiteAccount("user-b", { username: "b", password: "b-password" });

    expect(first.user?.username).toBe("warehouse.user");
    expect(second.user?.username).toBe("warehouse.user");
    expect(getSiteConnectionStatus("user-a").connected).toBe(true);
    expect(getSiteConnectionStatus("user-b").connected).toBe(true);

    const afterDisconnect = await (async () => {
      const { disconnectSiteAccount } = await import("../server/inventory/site-connection");
      return disconnectSiteAccount("user-a");
    })();
    expect(afterDisconnect.connected).toBe(false);
    expect(getSiteConnectionStatus("user-a").connected).toBe(false);
    expect(getSiteConnectionStatus("user-b").connected).toBe(true);
    expect(calls).toHaveLength(8);
  });

  it("expira no máximo em 30 minutos e também antes do cookie externo", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T01:00:00.000Z"));
    installFetchMock({ cookieMaxAge: 60 });
    await connectSiteAccount("user-a", { username: "a", password: "a-password" });
    expect(getSiteConnectionStatus("user-a").connected).toBe(true);

    vi.advanceTimersByTime(61_000);
    expect(getSiteConnectionStatus("user-a")).toEqual({
      connected: false,
      mode: "read_only",
      siteOrigin: SITE_ORIGIN,
    });
  });

  it("trata LOGIN_CHALLENGE_REQUIRED claramente e não repete nem contorna o desafio", async () => {
    const { calls } = installFetchMock({
      loginResponse: jsonResponse({ code: "LOGIN_CHALLENGE_REQUIRED" }, 403),
    });
    await expect(connectSiteAccount("user-a", { username: "a", password: "a-password" })).rejects.toMatchObject({
      code: "site_login_challenge_required",
      status: 429,
    });
    await expect(connectSiteAccount("user-a", { username: "a", password: "a-password" })).rejects.toMatchObject({
      code: "site_local_rate_limited",
    });
    expect(calls).toHaveLength(2);
  });

  it("trata bloqueio upstream sem retries automáticos e respeita Retry-After", async () => {
    const { calls } = installFetchMock({
      loginResponse: new Response(JSON.stringify({ code: "LOGIN_LOCKED", retryafter: 90 }), {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "90" },
      }),
    });
    await expect(connectSiteAccount("user-a", { username: "a", password: "a-password" })).rejects.toMatchObject({
      code: "site_login_locked",
      retryAfterSeconds: 90,
    });
    await expect(connectSiteAccount("user-a", { username: "a", password: "a-password" })).rejects.toMatchObject({
      code: "site_local_rate_limited",
    });
    expect(calls).toHaveLength(2);
  });

  it("não conecta catálogo malformado e não devolve senha ou cookies no status", async () => {
    const { calls } = installFetchMock({
      catalog: { materials: {}, lots: [], equipment: [] },
    });
    await expect(connectSiteAccount("user-a", { username: "a", password: "super-secret" })).rejects.toMatchObject({
      code: "site_catalog_invalid",
    });
    expect(getSiteConnectionStatus("user-a").connected).toBe(false);
    expect(JSON.stringify(getSiteConnectionStatus("user-a"))).not.toContain("super-secret");
    expect(calls).toHaveLength(4);
  });

  it("descarta a sessão quando uma reconsulta GET recebe 401", async () => {
    let sessionCalls = 0;
    const { calls } = installFetchMock({
      sessionResponse: () => {
        sessionCalls += 1;
        return sessionCalls === 1
          ? jsonResponse({ user: siteUser() })
          : jsonResponse({ code: "SESSION_EXPIRED" }, 401);
      },
    });
    await connectSiteAccount("user-a", { username: "a", password: "a-password" });
    await expect(testSiteConnection("user-a")).rejects.toMatchObject({ code: "site_session_expired", status: 401 });
    expect(getSiteConnectionStatus("user-a").connected).toBe(false);
    expect(calls.map((call) => call.method)).toEqual(["GET", "POST", "GET", "GET", "GET"]);
  });

  it.each([
    { code: "site_access_unavailable", change: { access_scope: { stock: "hidden", issue: "write" } } },
    { code: "site_password_change_required", change: { must_change_password: true } },
  ])("descarta a sessão quando a reconsulta informa $code", async ({ code, change }) => {
    let queries = 0;
    installFetchMock({ sessionResponse: () => {
      queries += 1;
      return jsonResponse({ user: { ...siteUser(), ...(queries > 1 ? change : {}) } });
    } });
    await connectSiteAccount("user-a", { username: "a", password: "request-only" });
    await expect(testSiteConnection("user-a")).rejects.toMatchObject({ code, status: 403 });
    expect(getSiteConnectionStatus("user-a").connected).toBe(false);
  });

  it("descarta a sessão quando o catálogo revoga o acesso depois da consulta de perfil", async () => {
    let queries = 0;
    installFetchMock({ bootstrapResponse: () => {
      queries += 1;
      const user = { ...siteUser(), ...(queries > 1 ? { access_scope: { stock: "hidden", issue: "hidden" } } : {}) };
      return jsonResponse({ user, materials: [], lots: [], equipment: [] });
    } });
    await connectSiteAccount("user-a", { username: "a", password: "request-only" });
    await expect(testSiteConnection("user-a")).rejects.toMatchObject({ code: "site_access_unavailable", status: 403 });
    expect(getSiteConnectionStatus("user-a").connected).toBe(false);
  });

  it("rejeita JSON externo malformado sem expor a resposta", async () => {
    const { calls } = installFetchMock({
      sessionResponse: new Response("{not-json", { status: 200, headers: { "content-type": "application/json" } }),
    });
    await expect(connectSiteAccount("user-a", { username: "a", password: "a-password" })).rejects.toMatchObject({
      code: "site_malformed_response",
    });
    expect(calls).toHaveLength(3);
  });
});

describe("limites e cancelamento de consultas", () => {
  function pauseCatalog(fetchMock: ReturnType<typeof vi.fn>) {
    const original = fetchMock.getMockImplementation()!;
    let release!: () => void;
    let notify!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const reached = new Promise<void>((resolve) => { notify = resolve; });
    fetchMock.mockImplementation(async (input: URL | RequestInfo, init?: RequestInit) => {
      if (String(input) === `${SITE_ORIGIN}/api/bootstrap/?section=catalog`) {
        notify();
        await barrier;
      }
      return original(input, init);
    });
    return { reached, release };
  }

  it("não restaura uma conexão que foi desconectada enquanto o login consultava o catálogo", async () => {
    const { fetchMock } = installFetchMock();
    const pause = pauseCatalog(fetchMock);
    const pending = connectSiteAccount("user-a", { username: "a", password: "request-only" });
    await pause.reached;
    expect(disconnectSiteAccount("user-a").connected).toBe(false);
    pause.release();
    await expect(pending).rejects.toMatchObject({ code: "site_connection_required" });
    expect(getSiteConnectionStatus("user-a").connected).toBe(false);
  });

  it("não restaura uma sessão desconectada durante Testar novamente", async () => {
    const { fetchMock } = installFetchMock();
    await connectSiteAccount("user-a", { username: "a", password: "request-only" });
    const pause = pauseCatalog(fetchMock);
    const pending = testSiteConnection("user-a");
    await pause.reached;
    disconnectSiteAccount("user-a");
    pause.release();
    await expect(pending).rejects.toMatchObject({ code: "site_connection_required" });
    expect(getSiteConnectionStatus("user-a").connected).toBe(false);
  });

  it("mantém o prazo de 15 segundos durante a leitura de um corpo que não termina", async () => {
    vi.useFakeTimers();
    const { fetchMock } = installFetchMock();
    fetchMock.mockImplementationOnce(async (_input: URL | RequestInfo, init?: RequestInit) => {
      const response = htmlResponse("<html></html>");
      vi.spyOn(response, "text").mockImplementation(() => new Promise<string>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted body")), { once: true });
      }));
      return response;
    });
    const pending = connectSiteAccount("user-a", { username: "a", password: "request-only" });
    const assertion = expect(pending).rejects.toMatchObject({ code: "site_connection_unavailable", status: 504 });
    await vi.advanceTimersByTimeAsync(15_001);
    await assertion;
    expect(getSiteConnectionStatus("user-a").connected).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("respeita retry_after aninhado no formato real de bloqueio do site", async () => {
    const { calls } = installFetchMock({
      loginResponse: jsonResponse({ error: { code: "LOGIN_LOCKED", details: { retry_after: 120 } } }, 403),
    });
    await expect(connectSiteAccount("user-a", { username: "a", password: "request-only" })).rejects.toMatchObject({
      code: "site_login_locked", retryAfterSeconds: 120,
    });
    await expect(connectSiteAccount("user-a", { username: "a", password: "request-only" })).rejects.toMatchObject({
      code: "site_local_rate_limited",
    });
    expect(calls).toHaveLength(2);
  });
});

describe("rotas protegidas e bloqueio de saída", () => {
  it("responde 401 para rota anônima e não toca no site externo", async () => {
    const { calls } = installFetchMock();
    const { server, baseUrl } = await listen(routeApp());
    try {
      const response = await localRequest(baseUrl, "/api/inventory/site-connection");
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: "Operador não autenticado.", code: "operator_auth_required" });
      expect(calls).toHaveLength(0);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it("retorna estado seguro desconectado para operador autenticado sem sessão externa", async () => {
    installFetchMock();
    const { server, baseUrl } = await listen(routeApp());
    try {
      const response = await localRequest(baseUrl, "/api/inventory/site-connection", {
        headers: { "x-open-id": "user-a" },
      });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ connected: false, mode: "read_only", siteOrigin: SITE_ORIGIN });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it("bloqueia stock-out depois de autenticar e autorizar, sem validar ou encaminhar payload", async () => {
    const { calls } = installFetchMock();
    const app = express();
    registerInventoryStockOutRoute(app, {
      authenticateRequest: async (req) => {
        if (req.header("x-open-id") !== "user-a") throw new Error("unauthenticated");
        return { openId: "user-a", role: "user" };
      },
      hasOperatorAccess: () => true,
    });
    const { server, baseUrl } = await listen(app);
    try {
      const response = await localRequest(baseUrl, "/api/inventory/stock-out", {
        method: "POST",
        headers: { "x-open-id": "user-a" },
        body: { arbitrary: "payload" },
      });
      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        code: "connection_test_only",
        error: "Modo de teste: nenhuma saída é enviada e nenhum estoque é alterado.",
      });
      expect(calls).toHaveLength(0);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it("nega todas as rotas de conexão a um operador sem autorização, sem consultar o site", async () => {
    const { calls } = installFetchMock();
    const app = express();
    app.use(express.json());
    registerSiteConnectionRoutes(app, {
      authenticateRequest: async () => ({ openId: "not-allowed", role: "user" }),
      hasOperatorAccess: () => false,
    });
    const { server, baseUrl } = await listen(app);
    try {
      for (const [method, path] of [
        ["GET", "/api/inventory/site-connection"],
        ["POST", "/api/inventory/site-connection"],
        ["POST", "/api/inventory/site-connection/test"],
        ["DELETE", "/api/inventory/site-connection"],
      ]) {
        const response = await localRequest(baseUrl, path, { method });
        expect(response.status).toBe(403);
        expect(response.body.code).toBe("operator_not_authorized");
      }
      expect(calls).toHaveLength(0);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });
});
