/**
 * Клиент хранилища кредов (buzz-secrets).
 *
 * Сервис живёт снаружи Buzz намеренно: значения не должны попадать в
 * события релея, потому что канал виден всей команде и хранится вечно.
 * Здесь только тонкий доступ — вся политика ролей на сервере.
 */

import { signRelayEvent } from "@/shared/api/tauri";

const TOKEN_KEY = "buzz.secrets.token";
const NIP98_KIND = 27235;
const URL_KEY = "buzz.secrets.url";

const DEFAULT_URL = "https://secrets.ai-marketing.cloud";

export type SecretEntry = {
  ref: string;
  project: string;
  name: string;
  login: string | null;
  note: string | null;
  version: number;
  created_by: string;
  updated_at: string;
};

export type AuditEntry = {
  ts: string;
  actor: string;
  role: string;
  action: string;
  project: string | null;
  name: string | null;
  detail: string | null;
};

export type SecretsRole = "admin" | "human" | "agent";

export function getSecretsToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setSecretsToken(token: string): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function getSecretsUrl(): string {
  return localStorage.getItem(URL_KEY) ?? DEFAULT_URL;
}

export function setSecretsUrl(url: string): void {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (trimmed) {
    localStorage.setItem(URL_KEY, trimmed);
  } else {
    localStorage.removeItem(URL_KEY);
  }
}

export class SecretsError extends Error {}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Заголовок входа по вашему ключу Buzz (NIP-98).
 *
 * Отдельные доступы раздавать не нужно: сервис узнаёт вас по той же
 * личности, что и мессенджер. Подпись привязана к методу, адресу и телу,
 * поэтому её нельзя переиграть против другого запроса.
 */
async function keyHeader(
  method: string,
  url: string,
  body: string,
): Promise<string> {
  const tags: string[][] = [
    ["u", url],
    ["method", method.toUpperCase()],
    ["nonce", crypto.randomUUID()],
  ];
  if (body) {
    tags.push(["payload", await sha256Hex(body)]);
  }
  const event = await signRelayEvent({ kind: NIP98_KIND, content: "", tags });
  return `Nostr ${btoa(JSON.stringify(event))}`;
}

async function request<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const method = init?.method ?? "GET";
  const url = `${getSecretsUrl()}${path}`;
  const body = init?.body === undefined ? "" : JSON.stringify(init.body);
  const token = getSecretsToken();
  // Токен остаётся запасным входом: если он задан руками, верим ему.
  const authorization = token
    ? `Bearer ${token}`
    : await keyHeader(method, url, body);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: body || undefined,
  });
  if (!response.ok) {
    // Сервер отвечает {detail: "..."} — показываем причину, а не код.
    const detail = await response
      .json()
      .then((body: { detail?: string }) => body.detail)
      .catch(() => undefined);
    throw new SecretsError(detail ?? `сервис ответил ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function listSecrets(): Promise<{
  secrets: SecretEntry[];
  role: SecretsRole;
}> {
  return request("/api/secrets");
}

/**
 * Значение показывается только людям: у роли agent такой операции нет,
 * и сервер вернёт 403. Каждый показ пишется в журнал.
 */
export async function revealSecret(
  project: string,
  name: string,
): Promise<string> {
  const body = await request<{ value: string }>("/api/reveal", {
    method: "POST",
    body: { project, name, reason: "десктоп Buzz" },
  });
  return body.value;
}

export async function fetchAudit(limit = 100): Promise<AuditEntry[]> {
  const body = await request<{ entries: AuditEntry[] }>(
    `/api/audit?limit=${limit}`,
  );
  return body.entries;
}

// ─── реестр MCP ────────────────────────────────────────────────────────

export type McpEntry = {
  persona: string;
  name: string;
  transport: "url" | "command";
  target: string;
  note: string | null;
  enabled: boolean;
  /** `proposed` — предложено агентом и ещё не одобрено человеком. */
  state: "proposed" | "approved";
  created_by: string;
  updated_at: string;
};

export async function listMcp(persona?: string): Promise<McpEntry[]> {
  const query = persona ? `?persona=${encodeURIComponent(persona)}` : "";
  const body = await request<{ servers: McpEntry[] }>(`/api/mcp${query}`);
  return body.servers;
}

export async function addMcp(entry: {
  persona: string;
  name: string;
  transport: "url" | "command";
  target: string;
  note?: string;
}): Promise<void> {
  await request("/api/mcp", { method: "POST", body: entry });
}

export async function toggleMcp(
  persona: string,
  name: string,
  enabled: boolean,
): Promise<void> {
  await request("/api/mcp/enabled", {
    method: "POST",
    body: { persona, name, enabled },
  });
}

export async function removeMcp(persona: string, name: string): Promise<void> {
  await request("/api/mcp/remove", { method: "POST", body: { persona, name } });
}

/** Одобрить предложенное агентом. Агенту эта операция недоступна. */
export async function approveMcp(persona: string, name: string): Promise<void> {
  await request("/api/mcp/approve", {
    method: "POST",
    body: { persona, name },
  });
}
