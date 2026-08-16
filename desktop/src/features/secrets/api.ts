/**
 * Клиент хранилища кредов (buzz-secrets).
 *
 * Сервис живёт снаружи Buzz намеренно: значения не должны попадать в
 * события релея, потому что канал виден всей команде и хранится вечно.
 * Здесь только тонкий доступ — вся политика ролей на сервере.
 */

const TOKEN_KEY = "buzz.secrets.token";
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

async function request<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const token = getSecretsToken();
  if (!token) {
    throw new SecretsError("не задан токен доступа");
  }
  const response = await fetch(`${getSecretsUrl()}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
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
