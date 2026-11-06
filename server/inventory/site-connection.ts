import type {
  SiteConnectionCredentials,
  SiteConnectionStatus,
} from "../../shared/site-connection";

/**
 * Módulo temporário e não produtivo: somente consulta autenticada ao Projeto Brasil.
 * Não adicionar endpoints de escrita, persistência, logs ou exposição de credenciais aqui.
 */
export const SITE_ORIGIN = "https://www.brazilhrproject.icu" as const;

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 100;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const DEFAULT_UPSTREAM_BLOCK_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_EXTERNAL_BODY_CHARS = 4_000_000;

type ExternalPhase = "login_page" | "login" | "session" | "catalog";

type CookieEntry = {
  value: string;
  expiresAt?: number;
};

type ExternalSession = {
  openId: string;
  cookies: Map<string, CookieEntry>;
  csrfToken: string;
  createdAt: number;
  expiresAt: number;
  lastUsedAt: number;
  status: SiteConnectionStatus;
};

type UserRecord = Record<string, unknown>;

type SiteConnectionErrorCode =
  | "site_connection_required"
  | "site_connection_busy"
  | "site_local_rate_limited"
  | "site_login_challenge_required"
  | "site_login_locked"
  | "site_rate_limited"
  | "site_invalid_credentials"
  | "site_session_expired"
  | "site_access_denied"
  | "site_password_change_required"
  | "site_malformed_response"
  | "site_catalog_invalid"
  | "site_access_unavailable"
  | "site_html_redirect"
  | "site_maintenance"
  | "site_connection_unavailable";

export class SiteConnectionError extends Error {
  readonly code: SiteConnectionErrorCode;
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(
    code: SiteConnectionErrorCode,
    message: string,
    status: number,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "SiteConnectionError";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type RateGuard = {
  attempts: number[];
  blockedUntil: number;
  operationInFlight: boolean;
  generation: number;
};

const sessions = new Map<string, ExternalSession>();
const rateGuards = new Map<string, RateGuard>();
const responseRequests = new WeakMap<Response, {
  controller: AbortController;
  timeout: ReturnType<typeof setTimeout>;
}>();

const MESSAGE_BY_CODE: Record<SiteConnectionErrorCode, string> = {
  site_connection_required: "Nenhuma sessão do site está conectada. Conecte sua conta para consultar.",
  site_connection_busy: "Já existe uma consulta ou tentativa de conexão em andamento para este usuário.",
  site_local_rate_limited: "Muitas tentativas de conexão. Aguarde alguns minutos antes de tentar novamente.",
  site_login_challenge_required:
    "O site solicitou CAPTCHA ou outro desafio de login. Resolva-o no site; o app não contorna esse bloqueio.",
  site_login_locked: "O site bloqueou temporariamente novas tentativas de login. Aguarde o prazo informado e tente novamente.",
  site_rate_limited: "O site limitou temporariamente as tentativas. Aguarde o prazo informado e tente novamente.",
  site_invalid_credentials: "Usuário ou senha do site inválidos.",
  site_session_expired: "A sessão do site expirou. Conecte sua conta novamente.",
  site_access_denied: "A conta do site não tem acesso permitido ao estoque e às solicitações.",
  site_password_change_required: "O site exige a troca da senha antes de permitir esta consulta.",
  site_malformed_response: "O site respondeu em formato inválido. Nenhum dado foi conectado.",
  site_catalog_invalid: "O catálogo do site não trouxe listas válidas para a consulta.",
  site_access_unavailable: "A conta do site não possui um escopo de acesso visível para estoque e solicitações.",
  site_html_redirect: "O site redirecionou o login de forma inesperada. Nenhuma sessão foi conectada.",
  site_maintenance: "O login ou a consulta do site está temporariamente indisponível.",
  site_connection_unavailable: "Não foi possível alcançar o site para consultar a conexão.",
};

function errorFor(
  code: SiteConnectionErrorCode,
  status = 502,
  retryAfterSeconds?: number,
): SiteConnectionError {
  return new SiteConnectionError(code, MESSAGE_BY_CODE[code], status, retryAfterSeconds);
}

export function isSiteConnectionError(error: unknown): error is SiteConnectionError {
  return error instanceof SiteConnectionError;
}

export function siteConnectionErrorBody(error: unknown): {
  error: string;
  code: SiteConnectionErrorCode | "site_connection_error";
  retryAfter?: number;
} {
  if (!isSiteConnectionError(error)) {
    return {
      error: "Não foi possível concluir a consulta de conexão.",
      code: "site_connection_error",
    };
  }

  return {
    error: error.message,
    code: error.code,
    ...(error.retryAfterSeconds ? { retryAfter: error.retryAfterSeconds } : {}),
  };
}

function asRecord(value: unknown): UserRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UserRecord)
    : null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normaliseCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function readExternalCode(payload: UserRecord | null): string {
  if (!payload) return "";
  const candidates = [payload.code, payload.error_code, payload.error, payload.detail];
  for (const candidate of candidates) {
    const code = normaliseCode(candidate);
    if (code) return code;
    const nested = asRecord(candidate);
    const nestedCode = normaliseCode(nested?.code);
    if (nestedCode) return nestedCode;
  }
  return "";
}

function isHtmlBody(text: string): boolean {
  return /^\s*(?:<!doctype\s+html|<html\b|<head\b|<body\b|<title\b|<)/i.test(text);
}

function readRetryAfter(response: Response, payload: UserRecord | null): number | undefined {
  const headerValue = response.headers.get("retry-after");
  const details = asRecord(asRecord(payload?.error)?.details);
  const payloadValue = payload?.retryafter ?? payload?.retry_after ?? payload?.retryAfter ?? details?.retry_after;
  const numeric = Number(headerValue ?? payloadValue);
  if (!Number.isFinite(numeric) || numeric < 0) return undefined;
  return Math.min(Math.ceil(numeric), 3600);
}

function mapExternalFailure(
  response: Response,
  payload: UserRecord | null,
  phase: ExternalPhase,
  htmlRedirect = false,
): SiteConnectionError {
  if (htmlRedirect) return errorFor("site_html_redirect", 502);

  const code = readExternalCode(payload);
  const retryAfterSeconds = readRetryAfter(response, payload);

  if (code === "LOGIN_CHALLENGE_REQUIRED" || code.includes("CAPTCHA") || code.includes("CHALLENGE")) {
    return errorFor("site_login_challenge_required", 429, retryAfterSeconds);
  }
  if (
    code === "LOGIN_LOCKED" ||
    code === "SOURCE_TEMPORARILY_BLOCKED" ||
    code.includes("LOCKED")
  ) {
    return errorFor("site_login_locked", 429, retryAfterSeconds);
  }
  if (code === "RATE_LIMITED" || code.includes("RATE_LIMIT")) {
    return errorFor("site_rate_limited", 429, retryAfterSeconds);
  }
  if (code === "MUST_CHANGE_PASSWORD" || code === "PASSWORD_CHANGE_REQUIRED") {
    return errorFor("site_password_change_required", 403);
  }
  if (
    code === "INVALID_CREDENTIALS" ||
    code === "INVALID_LOGIN" ||
    code === "LOGIN_FAILED" ||
    code.includes("INVALID_PASSWORD") ||
    (phase === "login" &&
      (code.includes("INVALID") || code.includes("CREDENTIAL") || code.includes("PASSWORD")))
  ) {
    return errorFor("site_invalid_credentials", 401);
  }

  if (phase === "session" || phase === "catalog") {
    if (response.status === 401) return errorFor("site_session_expired", 401);
    if (response.status === 403) return errorFor("site_access_denied", 403);
  } else if (response.status === 401) {
    return errorFor("site_invalid_credentials", 401);
  } else if (response.status === 403) {
    return errorFor("site_access_denied", 403);
  }

  if (response.status === 429) {
    return errorFor("site_rate_limited", 429, retryAfterSeconds);
  }
  if (response.status >= 500) return errorFor("site_maintenance", 503);
  return errorFor("site_connection_unavailable", 502);
}

function getSetCookies(response: Response): string[] {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

function setCookiesFromResponse(
  cookies: Map<string, CookieEntry>,
  response: Response,
  now: number,
): void {
  for (const rawCookie of getSetCookies(response)) {
    const parts = rawCookie.split(";").map((part) => part.trim());
    const first = parts.shift();
    if (!first) continue;
    const separator = first.indexOf("=");
    if (separator <= 0) continue;
    const name = first.slice(0, separator).trim();
    const value = first.slice(separator + 1);
    if (!name) continue;

    let expiresAt: number | undefined;
    let maxAge: number | undefined;
    for (const attribute of parts) {
      const attributeSeparator = attribute.indexOf("=");
      const attributeName = (attributeSeparator >= 0 ? attribute.slice(0, attributeSeparator) : attribute)
        .trim()
        .toLowerCase();
      const attributeValue = attributeSeparator >= 0 ? attribute.slice(attributeSeparator + 1).trim() : "";
      if (attributeName === "max-age") {
        const parsed = Number(attributeValue);
        if (Number.isFinite(parsed)) maxAge = parsed;
      } else if (attributeName === "expires") {
        const parsed = Date.parse(attributeValue);
        if (Number.isFinite(parsed)) expiresAt = parsed;
      }
    }
    if (maxAge !== undefined) expiresAt = now + maxAge * 1000;
    if ((maxAge !== undefined && maxAge <= 0) || (expiresAt !== undefined && expiresAt <= now)) {
      // Mantém somente um tombstone em memória para que a sessão expire antes
      // de qualquer cookie externo explicitamente revogado; ele nunca é enviado.
      cookies.set(name, { value: "", expiresAt: now });
      continue;
    }
    cookies.set(name, { value, ...(expiresAt !== undefined ? { expiresAt } : {}) });
  }
}

function cookieHeader(cookies: Map<string, CookieEntry>): string {
  return [...cookies.entries()]
    .filter(([, entry]) => entry.value.length > 0)
    .map(([name, entry]) => `${name}=${entry.value}`)
    .join("; ");
}

function earliestCookieExpiry(cookies: Map<string, CookieEntry>): number | undefined {
  const expirations = [...cookies.values()]
    .map((cookie) => cookie.expiresAt)
    .filter((value): value is number => value !== undefined);
  return expirations.length > 0 ? Math.min(...expirations) : undefined;
}

function refreshSessionExpiry(session: ExternalSession, now: number): void {
  const hardExpiry = session.createdAt + SESSION_TTL_MS;
  const cookieExpiry = earliestCookieExpiry(session.cookies);
  session.expiresAt = Math.min(hardExpiry, cookieExpiry ?? hardExpiry);
}

function ensureSession(openId: string, now = Date.now()): ExternalSession {
  cleanupExpiredState(now);
  const session = sessions.get(openId);
  if (!session) throw errorFor("site_connection_required", 401);
  refreshSessionExpiry(session, now);
  if (session.expiresAt <= now) {
    sessions.delete(openId);
    throw errorFor("site_session_expired", 401);
  }
  session.lastUsedAt = now;
  return session;
}

function disconnectedStatus(): SiteConnectionStatus {
  return {
    connected: false,
    mode: "read_only",
    siteOrigin: SITE_ORIGIN,
  };
}

function copyStatus(status: SiteConnectionStatus): SiteConnectionStatus {
  return {
    ...status,
    ...(status.user ? { user: { ...status.user } } : {}),
    ...(status.catalog ? { catalog: { ...status.catalog } } : {}),
  };
}

function cleanupExpiredState(now = Date.now()): void {
  for (const [openId, session] of sessions) {
    refreshSessionExpiry(session, now);
    if (session.expiresAt <= now) sessions.delete(openId);
  }
  for (const [openId, guard] of rateGuards) {
    guard.attempts = guard.attempts.filter((attempt) => now - attempt < LOGIN_WINDOW_MS);
    if (!guard.operationInFlight && guard.blockedUntil <= now && guard.attempts.length === 0) {
      rateGuards.delete(openId);
    }
  }
  while (sessions.size > MAX_SESSIONS) {
    const oldest = [...sessions.entries()].sort(([, left], [, right]) => left.lastUsedAt - right.lastUsedAt)[0];
    if (!oldest) break;
    sessions.delete(oldest[0]);
  }
}

function guardFor(openId: string): RateGuard {
  cleanupExpiredState();
  const existing = rateGuards.get(openId);
  if (existing) return existing;
  const created: RateGuard = { attempts: [], blockedUntil: 0, operationInFlight: false, generation: 0 };
  rateGuards.set(openId, created);
  return created;
}

function beginOperation(openId: string): RateGuard {
  const guard = guardFor(openId);
  const now = Date.now();
  if (guard.blockedUntil > now) {
    const retryAfterSeconds = Math.ceil((guard.blockedUntil - now) / 1000);
    throw errorFor("site_local_rate_limited", 429, retryAfterSeconds);
  }
  if (guard.operationInFlight) throw errorFor("site_connection_busy", 429);
  guard.operationInFlight = true;
  return guard;
}

function beginLogin(openId: string): RateGuard {
  const guard = beginOperation(openId);
  const now = Date.now();
  guard.attempts = guard.attempts.filter((attempt) => now - attempt < LOGIN_WINDOW_MS);
  if (guard.attempts.length >= MAX_LOGIN_ATTEMPTS) {
    guard.operationInFlight = false;
    guard.blockedUntil = now + DEFAULT_UPSTREAM_BLOCK_MS;
    throw errorFor("site_local_rate_limited", 429, Math.ceil(DEFAULT_UPSTREAM_BLOCK_MS / 1000));
  }
  return guard;
}

function finishLogin(openId: string, guard: RateGuard, error?: SiteConnectionError): void {
  const now = Date.now();
  guard.operationInFlight = false;
  if (!error) {
    guard.attempts = [];
    guard.blockedUntil = 0;
    return;
  }
  guard.attempts.push(now);
  if (
    error.code === "site_login_challenge_required" ||
    error.code === "site_login_locked" ||
    error.code === "site_rate_limited"
  ) {
    const retryAfter = error.retryAfterSeconds ? error.retryAfterSeconds * 1000 : DEFAULT_UPSTREAM_BLOCK_MS;
    guard.blockedUntil = now + retryAfter;
  }
  rateGuards.set(openId, guard);
}

function finishOperation(guard: RateGuard): void {
  guard.operationInFlight = false;
}

function assertCurrentOperation(openId: string, guard: RateGuard, generation: number): void {
  if (rateGuards.get(openId) !== guard || guard.generation !== generation) {
    throw errorFor("site_connection_required", 401);
  }
}

function extractInputValue(html: string, inputName: string): string | null {
  const inputTags = html.match(/<input\b[^>]*>/gi) ?? [];
  for (const tag of inputTags) {
    const attributes = new Map<string, string>();
    const attributePattern = /([:\w-]+)\s*=\s*(["'])(.*?)\2/gi;
    let match: RegExpExecArray | null;
    while ((match = attributePattern.exec(tag)) !== null) {
      attributes.set(match[1].toLowerCase(), match[3]);
    }
    if (attributes.get("name")?.toLowerCase() === inputName.toLowerCase()) {
      return attributes.get("value") ?? null;
    }
  }
  return null;
}

function userHasVisibleInventoryAccess(user: UserRecord): boolean {
  const scopes: unknown[] = [user.access_scope, user.accessScope, user.permissions];
  let sawScope = false;
  for (const candidate of scopes) {
    const scope = asRecord(candidate);
    if (!scope) {
      if (normaliseCode(candidate) === "HIDDEN") return false;
      continue;
    }
    for (const key of ["stock", "issue"]) {
      if (!(key in scope)) continue;
      sawScope = true;
      const value = scope[key];
      const valueRecord = asRecord(value);
      if (
        value === false ||
        value === null ||
        normaliseCode(value) === "HIDDEN" ||
        normaliseCode(value) === "NONE" ||
        normaliseCode(value) === "DENIED" ||
        normaliseCode(value) === "NO_ACCESS" ||
        valueRecord?.hidden === true ||
        valueRecord?.visible === false
      ) {
        return false;
      }
    }
  }
  return sawScope || scopes.every((scope) => scope === undefined) ? true : false;
}

function publicUserFromExternal(user: UserRecord): SiteConnectionStatus["user"] {
  const name = typeof user.name === "string" ? user.name.trim() : "";
  const username = typeof user.username === "string" ? user.username.trim() : "";
  const role = typeof user.role === "string" ? user.role.trim() : "";
  if (!name || !username || !role) throw errorFor("site_malformed_response", 502);
  const normalisedRole = role.toLowerCase();
  return {
    name,
    username,
    role,
    requiresApproval: normalisedRole !== "manager" && normalisedRole !== "admin",
  };
}

function checkMustChangePassword(user: UserRecord): void {
  if (user.must_change_password === true || user.mustChangePassword === true) {
    throw errorFor("site_password_change_required", 403);
  }
}

async function readText(response: Response): Promise<string> {
  const request = responseRequests.get(response);
  let text: string;
  try {
    text = await response.text();
  } catch {
    if (request?.controller.signal.aborted) throw errorFor("site_connection_unavailable", 504);
    throw errorFor("site_malformed_response", 502);
  } finally {
    if (request) clearTimeout(request.timeout);
    responseRequests.delete(response);
  }
  if (text.length > MAX_EXTERNAL_BODY_CHARS) throw errorFor("site_malformed_response", 502);
  return text;
}

function parseJson(text: string): UserRecord {
  try {
    const parsed: unknown = JSON.parse(text);
    const record = asRecord(parsed);
    if (!record) throw new Error("not an object");
    return record;
  } catch {
    throw errorFor("site_malformed_response", 502);
  }
}

function externalUrl(path: "/login/" | "/api/login/" | "/api/session/" | "/api/bootstrap/?section=catalog"): string {
  return new URL(path, `${SITE_ORIGIN}/`).toString();
}

async function externalFetch(
  path: "/login/" | "/api/login/" | "/api/session/" | "/api/bootstrap/?section=catalog",
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(externalUrl(path), {
      ...init,
      redirect: "manual",
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    if (controller.signal.aborted) throw errorFor("site_connection_unavailable", 504);
    if (isSiteConnectionError(error)) throw error;
    throw errorFor("site_connection_unavailable", 502);
  }

  if (response.url) {
    try {
      if (new URL(response.url).origin !== SITE_ORIGIN) throw errorFor("site_html_redirect", 502);
    } catch (error) {
      clearTimeout(timeout);
      if (isSiteConnectionError(error)) throw error;
      throw errorFor("site_html_redirect", 502);
    }
  }
  if (response.status >= 300 && response.status < 400) {
    clearTimeout(timeout);
    throw errorFor("site_html_redirect", 502);
  }
  // Mantém o prazo ativo até readText consumir o corpo, não apenas até os headers.
  responseRequests.set(response, { controller, timeout });
  return response;
}

async function loginAndQuery(
  openId: string,
  credentials: SiteConnectionCredentials,
): Promise<ExternalSession> {
  const cookies = new Map<string, CookieEntry>();
  const firstResponse = await externalFetch("/login/", {
    method: "GET",
    headers: { Accept: "text/html" },
  });
  const firstBody = await readText(firstResponse);
  setCookiesFromResponse(cookies, firstResponse, Date.now());
  if (!firstResponse.ok) {
    if (firstResponse.status >= 500) throw errorFor("site_maintenance", 503);
    throw mapExternalFailure(firstResponse, null, "login_page");
  }
  if (!isHtmlBody(firstBody)) throw errorFor("site_malformed_response", 502);
  const csrfToken = extractInputValue(firstBody, "csrfmiddlewaretoken");
  const csrfCookie = cookies.get("csrftoken")?.value;
  if (!nonEmptyString(csrfToken) || !nonEmptyString(csrfCookie)) {
    throw errorFor("site_malformed_response", 502);
  }

  const loginResponse = await externalFetch("/api/login/", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRFToken": csrfToken,
      Origin: SITE_ORIGIN,
      Referer: `${SITE_ORIGIN}/login/`,
      Cookie: cookieHeader(cookies),
    },
    body: JSON.stringify({ username: credentials.username, password: credentials.password }),
  });
  const loginBodyText = await readText(loginResponse);
  setCookiesFromResponse(cookies, loginResponse, Date.now());
  if (loginResponse.status >= 500) throw errorFor("site_maintenance", 503);
  if (isHtmlBody(loginBodyText)) throw errorFor("site_html_redirect", 502);
  const loginBody = parseJson(loginBodyText);
  const loginCode = readExternalCode(loginBody);
  const loginUser = asRecord(loginBody.user);
  if (
    loginBody.must_change_password === true ||
    loginBody.mustChangePassword === true ||
    loginUser?.must_change_password === true ||
    loginUser?.mustChangePassword === true
  ) {
    throw errorFor("site_password_change_required", 403);
  }
  if (!loginResponse.ok || loginBody.success === false || loginBody.ok === false || loginCode) {
    throw mapExternalFailure(loginResponse, loginBody, "login");
  }

  const now = Date.now();
  const session: ExternalSession = {
    openId,
    cookies,
    csrfToken,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    lastUsedAt: now,
    status: disconnectedStatus(),
  };
  refreshSessionExpiry(session, now);
  await refreshExternalStatus(session);
  return session;
}

async function authenticatedJson(
  session: ExternalSession,
  path: "/api/session/" | "/api/bootstrap/?section=catalog",
  phase: "session" | "catalog",
): Promise<UserRecord> {
  const now = Date.now();
  refreshSessionExpiry(session, now);
  if (session.expiresAt <= now) throw errorFor("site_session_expired", 401);
  const response = await externalFetch(path, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Cookie: cookieHeader(session.cookies),
    },
  });
  const bodyText = await readText(response);
  setCookiesFromResponse(session.cookies, response, Date.now());
  refreshSessionExpiry(session, Date.now());
  if (isHtmlBody(bodyText)) throw errorFor("site_html_redirect", 502);
  const body = parseJson(bodyText);
  if (!response.ok) throw mapExternalFailure(response, body, phase);
  return body;
}

async function refreshExternalStatus(session: ExternalSession): Promise<SiteConnectionStatus> {
  let sessionPayload: UserRecord;
  try {
    sessionPayload = await authenticatedJson(session, "/api/session/", "session");
  } catch (error) {
    if (isSiteConnectionError(error) && error.code === "site_session_expired") throw error;
    throw error;
  }
  const sessionUser = asRecord(sessionPayload.user);
  if (!sessionUser) throw errorFor("site_malformed_response", 502);
  checkMustChangePassword(sessionUser);
  if (!userHasVisibleInventoryAccess(sessionUser)) throw errorFor("site_access_unavailable", 403);

  const catalogPayload = await authenticatedJson(
    session,
    "/api/bootstrap/?section=catalog",
    "catalog",
  );
  const catalogUser = asRecord(catalogPayload.user);
  if (!catalogUser) throw errorFor("site_malformed_response", 502);
  checkMustChangePassword(catalogUser);
  if (!userHasVisibleInventoryAccess(catalogUser)) throw errorFor("site_access_unavailable", 403);

  const materials = catalogPayload.materials;
  const lots = catalogPayload.lots;
  const equipment = catalogPayload.equipment;
  if (!Array.isArray(materials) || !Array.isArray(lots) || !Array.isArray(equipment)) {
    throw errorFor("site_catalog_invalid", 502);
  }

  const publicUser = publicUserFromExternal(sessionUser);
  const now = Date.now();
  refreshSessionExpiry(session, now);
  if (session.expiresAt <= now) throw errorFor("site_session_expired", 401);
  session.lastUsedAt = now;
  session.status = {
    connected: true,
    mode: "read_only",
    siteOrigin: SITE_ORIGIN,
    checkedAt: new Date(now).toISOString(),
    expiresAt: new Date(session.expiresAt).toISOString(),
    user: publicUser,
    catalog: {
      materialCount: materials.length,
      lotCount: lots.length,
      equipmentCount: equipment.length,
    },
  };
  return copyStatus(session.status);
}

export function getSiteConnectionStatus(openId: string): SiteConnectionStatus {
  const session = sessions.get(openId);
  if (!session) return disconnectedStatus();
  try {
    return copyStatus(ensureSession(openId).status);
  } catch (error) {
    if (
      isSiteConnectionError(error) &&
      (error.code === "site_session_expired" || error.code === "site_connection_required")
    ) {
      return disconnectedStatus();
    }
    throw error;
  }
}

export async function connectSiteAccount(
  openId: string,
  credentials: SiteConnectionCredentials,
): Promise<SiteConnectionStatus> {
  const guard = beginLogin(openId);
  const generation = guard.generation;
  try {
    if (!nonEmptyString(credentials.username) || !nonEmptyString(credentials.password)) {
      throw errorFor("site_invalid_credentials", 400);
    }
    const session = await loginAndQuery(openId, credentials);
    assertCurrentOperation(openId, guard, generation);
    sessions.set(openId, session);
    cleanupExpiredState();
    finishLogin(openId, guard);
    return copyStatus(session.status);
  } catch (caughtError) {
    const error = isSiteConnectionError(caughtError)
      ? caughtError
      : errorFor("site_connection_unavailable", 502);
    finishLogin(openId, guard, error);
    throw error;
  }
}

export async function testSiteConnection(openId: string): Promise<SiteConnectionStatus> {
  const session = ensureSession(openId);
  const guard = beginOperation(openId);
  const generation = guard.generation;
  try {
    const status = await refreshExternalStatus(session);
    assertCurrentOperation(openId, guard, generation);
    sessions.set(openId, session);
    cleanupExpiredState();
    return status;
  } catch (caughtError) {
    const error = isSiteConnectionError(caughtError)
      ? caughtError
      : errorFor("site_connection_unavailable", 502);
    if (error.status === 401 || error.status === 403 || error.code === "site_html_redirect") {
      sessions.delete(openId);
    }
    throw error;
  } finally {
    finishOperation(guard);
  }
}

export function disconnectSiteAccount(openId: string): SiteConnectionStatus {
  const guard = rateGuards.get(openId);
  if (guard) guard.generation += 1;
  sessions.delete(openId);
  return disconnectedStatus();
}

/** Reset only in-memory state; intended for isolated unit tests, never persistence. */
export function resetSiteConnectionStateForTests(): void {
  sessions.clear();
  rateGuards.clear();
}
