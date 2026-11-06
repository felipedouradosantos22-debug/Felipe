import type { Express, Request, Response } from "express";
import type { SiteConnectionCredentials } from "../../shared/site-connection";
import {
  connectSiteAccount,
  disconnectSiteAccount,
  getSiteConnectionStatus,
  isSiteConnectionError,
  siteConnectionErrorBody,
  testSiteConnection,
} from "./site-connection";

export type SiteOperator = {
  openId: string;
  role: string;
};

export type SiteConnectionRouteDependencies = {
  authenticateRequest: (req: Request) => Promise<SiteOperator>;
  hasOperatorAccess: (user: SiteOperator) => boolean | Promise<boolean>;
};

/** Mantém a mesma regra de operador usada pelo endpoint de saída do servidor. */
export function hasOperatorAccess(user: SiteOperator): boolean {
  if (user.role === "admin") return true;
  const configuredOperators = (process.env.INVENTORY_OPERATOR_OPEN_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return configuredOperators.length === 0 || configuredOperators.includes(user.openId);
}

function noStore(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
}

async function authenticateOperator(
  req: Request,
  res: Response,
  dependencies: SiteConnectionRouteDependencies,
): Promise<SiteOperator | null> {
  try {
    const user = await dependencies.authenticateRequest(req);
    if (!user?.openId || !(await dependencies.hasOperatorAccess(user))) {
      noStore(res);
      res.status(403).json({
        error: "Este usuário não está autorizado a usar a conexão de teste.",
        code: "operator_not_authorized",
      });
      return null;
    }
    return user;
  } catch {
    noStore(res);
    res.status(401).json({
      error: "Operador não autenticado.",
      code: "operator_auth_required",
    });
    return null;
  }
}

function respondWithConnectionError(res: Response, error: unknown): void {
  noStore(res);
  if (isSiteConnectionError(error)) {
    if (error.retryAfterSeconds) res.setHeader("Retry-After", String(error.retryAfterSeconds));
    res.status(error.status).json(siteConnectionErrorBody(error));
    return;
  }
  res.status(502).json(siteConnectionErrorBody(error));
}

function parseCredentials(body: unknown): SiteConnectionCredentials | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const candidate = body as Record<string, unknown>;
  if (typeof candidate.username !== "string" || typeof candidate.password !== "string") return null;
  if (!candidate.username.trim() || !candidate.password) return null;
  return { username: candidate.username, password: candidate.password };
}

/**
 * Rotas temporárias e não produtivas: login externo e GETs de sessão/catálogo somente.
 * Nenhuma senha, cookie ou token é devolvido ao cliente do app.
 */
export function registerSiteConnectionRoutes(
  app: Express,
  dependencies: SiteConnectionRouteDependencies,
): void {
  app.get("/api/inventory/site-connection", async (req, res) => {
    const operator = await authenticateOperator(req, res, dependencies);
    if (!operator) return;
    noStore(res);
    try {
      res.json(getSiteConnectionStatus(operator.openId));
    } catch (error) {
      respondWithConnectionError(res, error);
    }
  });

  app.post("/api/inventory/site-connection", async (req, res) => {
    const operator = await authenticateOperator(req, res, dependencies);
    if (!operator) return;
    noStore(res);
    const credentials = parseCredentials(req.body);
    if (!credentials) {
      res.status(400).json({
        error: "Informe usuário e senha do site para iniciar a conexão.",
        code: "invalid_site_credentials_payload",
      });
      return;
    }
    try {
      res.json(await connectSiteAccount(operator.openId, credentials));
    } catch (error) {
      respondWithConnectionError(res, error);
    }
  });

  app.post("/api/inventory/site-connection/test", async (req, res) => {
    const operator = await authenticateOperator(req, res, dependencies);
    if (!operator) return;
    noStore(res);
    try {
      res.json(await testSiteConnection(operator.openId));
    } catch (error) {
      respondWithConnectionError(res, error);
    }
  });

  app.delete("/api/inventory/site-connection", async (req, res) => {
    const operator = await authenticateOperator(req, res, dependencies);
    if (!operator) return;
    noStore(res);
    res.json(disconnectSiteAccount(operator.openId));
  });
}
