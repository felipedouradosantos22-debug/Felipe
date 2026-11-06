import "dotenv/config";
import express, { type Express, type Request } from "express";
import { createServer } from "http";
import { fileURLToPath } from "node:url";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { createCorsMiddleware } from "./cors";
import { clearLegacySessionCookie } from "./cookies";
import { sdk } from "./sdk";
import {
  hasOperatorAccess,
  registerSiteConnectionRoutes,
  type SiteOperator,
} from "../inventory/site-connection-routes";

export type InventoryRouteDependencies = {
  authenticateRequest: (req: Request) => Promise<SiteOperator>;
  hasOperatorAccess: (user: SiteOperator) => boolean | Promise<boolean>;
};

/**
 * O modo atual é deliberadamente não produtivo: autenticação e autorização continuam
 * obrigatórias, mas nenhuma saída, documento, aprovação ou movimentação chega a um site.
 */
export function registerInventoryStockOutRoute(
  app: Express,
  dependencies: InventoryRouteDependencies,
): void {
  app.post("/api/inventory/stock-out", async (req, res) => {
    let operator: SiteOperator;
    try {
      operator = await dependencies.authenticateRequest(req);
    } catch {
      res.status(401).json({ error: "Operador não autenticado.", code: "operator_auth_required" });
      return;
    }
    if (!(await dependencies.hasOperatorAccess(operator))) {
      res.status(403).json({
        error: "Este usuário não está autorizado a registrar saídas.",
        code: "operator_not_authorized",
      });
      return;
    }

    res.status(409).json({
      code: "connection_test_only",
      error: "Modo de teste: nenhuma saída é enviada e nenhum estoque é alterado.",
    });
  });
}

export function createApp(): Express {
  const app = express();
  const inventoryAuth: InventoryRouteDependencies = {
    authenticateRequest: (req) => sdk.authenticateRequest(req),
    hasOperatorAccess,
  };

  app.use(createCorsMiddleware());
  app.use(clearLegacySessionCookie());

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  registerSiteConnectionRoutes(app, inventoryAuth);
  registerInventoryStockOutRoute(app, inventoryAuth);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  return app;
}

export async function startServer(): Promise<void> {
  const app = createApp();
  const server = createServer(app);
  const port = parseInt(process.env.PORT || "3000");
  server.listen(port, () => {
    console.log("[api] server listening");
  });
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  if (!entrypoint) return false;
  try {
    return fileURLToPath(import.meta.url) === entrypoint;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  startServer().catch(() => {
    console.error("[api] server failed to start");
  });
}
