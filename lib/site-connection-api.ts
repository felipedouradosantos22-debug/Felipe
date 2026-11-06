import type {
  SiteConnectionCredentials,
  SiteConnectionStatus,
} from "@shared/site-connection";

import { apiCall } from "@/lib/_core/api";

const SITE_ORIGIN = "https://www.brazilhrproject.icu" as const;
const SITE_CONNECTION_ENDPOINT = "/api/inventory/site-connection";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function isValidDateString(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Valida e reduz a resposta pública da conexão. Cookies, CSRF e credenciais
 * não fazem parte do tipo e nunca são repassados para a interface.
 */
function parseSiteConnectionStatus(value: unknown): SiteConnectionStatus {
  if (!isRecord(value) || typeof value.connected !== "boolean") {
    throw new Error("A resposta da conexão de teste é inválida.");
  }

  if (value.connected === false) {
    return {
      connected: false,
      mode: "read_only",
      siteOrigin: SITE_ORIGIN,
      ...(isValidDateString(value.checkedAt) ? { checkedAt: value.checkedAt } : {}),
      ...(isValidDateString(value.expiresAt) ? { expiresAt: value.expiresAt } : {}),
    };
  }

  if (
    value.mode !== "read_only" ||
    value.siteOrigin !== SITE_ORIGIN ||
    !isRecord(value.user) ||
    !isRecord(value.catalog) ||
    typeof value.user.name !== "string" ||
    typeof value.user.username !== "string" ||
    typeof value.user.role !== "string" ||
    typeof value.user.requiresApproval !== "boolean" ||
    !isNonNegativeInteger(value.catalog.materialCount) ||
    !isNonNegativeInteger(value.catalog.lotCount) ||
    !isNonNegativeInteger(value.catalog.equipmentCount) ||
    !isValidDateString(value.checkedAt)
  ) {
    throw new Error("A resposta da conexão de teste não foi validada.");
  }

  return {
    connected: true,
    mode: "read_only",
    siteOrigin: SITE_ORIGIN,
    checkedAt: value.checkedAt,
    ...(isValidDateString(value.expiresAt) ? { expiresAt: value.expiresAt } : {}),
    user: {
      name: value.user.name,
      username: value.user.username,
      role: value.user.role,
      requiresApproval: value.user.requiresApproval,
    },
    catalog: {
      materialCount: value.catalog.materialCount,
      lotCount: value.catalog.lotCount,
      equipmentCount: value.catalog.equipmentCount,
    },
  };
}

export async function getSiteConnectionStatus(): Promise<SiteConnectionStatus> {
  const response = await apiCall<unknown>(SITE_CONNECTION_ENDPOINT);
  return parseSiteConnectionStatus(response);
}

export async function connectSiteConnection(
  credentials: SiteConnectionCredentials,
): Promise<SiteConnectionStatus> {
  const username = credentials.username.trim();
  if (!username || !credentials.password) {
    throw new Error("Informe o usuário e a senha do site.");
  }

  const response = await apiCall<unknown>(SITE_CONNECTION_ENDPOINT, {
    method: "POST",
    body: JSON.stringify({ username, password: credentials.password }),
  });
  return parseSiteConnectionStatus(response);
}

export async function testSiteConnection(): Promise<SiteConnectionStatus> {
  const response = await apiCall<unknown>(`${SITE_CONNECTION_ENDPOINT}/test`, {
    method: "POST",
  });
  return parseSiteConnectionStatus(response);
}

export async function disconnectSiteConnection(): Promise<void> {
  await apiCall<unknown>(SITE_CONNECTION_ENDPOINT, {
    method: "DELETE",
  });
}
