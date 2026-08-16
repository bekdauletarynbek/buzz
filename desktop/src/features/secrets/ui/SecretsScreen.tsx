import * as React from "react";

import {
  type AuditEntry,
  type SecretEntry,
  type SecretsRole,
  fetchAudit,
  getSecretsToken,
  getSecretsUrl,
  listSecrets,
  revealSecret,
  setSecretsToken,
  setSecretsUrl,
} from "@/features/secrets/api";
import { cn } from "@/shared/lib/cn";

/**
 * Вкладка «Креды».
 *
 * Пароли, которые агент создаёт по ходу работы, нельзя называть в канале:
 * сообщение — подписанное событие, оно ложится в общий лог навсегда.
 * Поэтому агент кладёт их в хранилище и пишет в чат только ссылку
 * `secret://проект/имя`, а значение человек смотрит здесь.
 */
export function SecretsScreen() {
  const [token, setToken] = React.useState(() => getSecretsToken());
  const [url, setUrl] = React.useState(() => getSecretsUrl());
  const [tab, setTab] = React.useState<"secrets" | "audit">("secrets");
  const [secrets, setSecrets] = React.useState<SecretEntry[]>([]);
  const [audit, setAudit] = React.useState<AuditEntry[]>([]);
  const [role, setRole] = React.useState<SecretsRole | null>(null);
  const [revealed, setRevealed] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!getSecretsToken()) {
      setError("введите токен доступа");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (tab === "audit") {
        setAudit(await fetchAudit());
      } else {
        const data = await listSecrets();
        setSecrets(data.secrets);
        setRole(data.role);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  React.useEffect(() => {
    if (getSecretsToken()) {
      void load();
    }
  }, [load]);

  const saveAccess = React.useCallback(() => {
    setSecretsUrl(url);
    setSecretsToken(token.trim());
    // Раскрытые значения сбрасываем: сменился доступ — сменился и человек.
    setRevealed({});
    void load();
  }, [load, token, url]);

  const reveal = React.useCallback(async (secret: SecretEntry) => {
    try {
      const value = await revealSecret(secret.project, secret.name);
      setRevealed((current) => ({ ...current, [secret.ref]: value }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const canReveal = role !== "agent";

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Креды</h1>
        <p className="text-sm text-muted-foreground">
          Значения хранятся зашифрованными вне релея. Каждый показ пишется в
          журнал.
        </p>
      </header>

      <section className="mb-4 flex flex-wrap items-center gap-2">
        <input
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          onChange={(event) => setUrl(event.target.value)}
          placeholder="адрес сервиса"
          value={url}
        />
        <input
          autoComplete="off"
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          onChange={(event) => setToken(event.target.value)}
          placeholder="токен (bsk_…)"
          type="password"
          value={token}
        />
        <button
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          onClick={saveAccess}
          type="button"
        >
          Подключиться
        </button>
      </section>

      <nav className="mb-3 flex gap-2">
        {(["secrets", "audit"] as const).map((value) => (
          <button
            className={cn(
              "rounded-md border border-border px-3 py-1.5 text-sm",
              tab === value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground",
            )}
            key={value}
            onClick={() => setTab(value)}
            type="button"
          >
            {value === "secrets" ? "Секреты" : "Журнал"}
          </button>
        ))}
      </nav>

      {error ? (
        <p className="mb-3 text-sm text-destructive">ошибка: {error}</p>
      ) : null}
      {loading ? (
        <p className="mb-3 text-sm text-muted-foreground">загружаю…</p>
      ) : null}

      {tab === "secrets" ? (
        <SecretsTable
          canReveal={canReveal}
          onReveal={reveal}
          revealed={revealed}
          secrets={secrets}
        />
      ) : (
        <AuditTable entries={audit} />
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Агент кладёт креды сам и пишет в чат только ссылку{" "}
        <code className="rounded bg-muted px-1">secret://проект/имя</code>.
        Прочитать значение он не может — у его роли такой операции нет.
      </p>
    </div>
  );
}

function SecretsTable({
  canReveal,
  onReveal,
  revealed,
  secrets,
}: {
  canReveal: boolean;
  onReveal: (secret: SecretEntry) => void;
  revealed: Record<string, string>;
  secrets: SecretEntry[];
}) {
  if (secrets.length === 0) {
    return <p className="text-sm text-muted-foreground">пока пусто</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-muted-foreground">
        <tr>
          <th className="border-b border-border py-2 pr-3">Проект</th>
          <th className="border-b border-border py-2 pr-3">Что</th>
          <th className="border-b border-border py-2 pr-3">Логин</th>
          <th className="border-b border-border py-2 pr-3">Значение</th>
          <th className="border-b border-border py-2">Обновлён</th>
        </tr>
      </thead>
      <tbody>
        {secrets.map((secret) => (
          <tr key={secret.ref}>
            <td className="border-b border-border py-2 pr-3">
              {secret.project}
            </td>
            <td className="border-b border-border py-2 pr-3">
              {secret.name}
              {secret.note ? (
                <div className="text-xs text-muted-foreground">
                  {secret.note}
                </div>
              ) : null}
            </td>
            <td className="border-b border-border py-2 pr-3">
              {secret.login ?? "—"}
            </td>
            <td className="break-all border-b border-border py-2 pr-3">
              {revealed[secret.ref] ? (
                <span className="font-mono text-emerald-500">
                  {revealed[secret.ref]}
                </span>
              ) : canReveal ? (
                <button
                  className="rounded-md border border-border px-2 py-1 text-xs"
                  onClick={() => onReveal(secret)}
                  type="button"
                >
                  показать
                </button>
              ) : (
                <span className="text-muted-foreground">
                  роль agent не читает
                </span>
              )}
            </td>
            <td className="border-b border-border py-2 text-xs text-muted-foreground">
              {secret.updated_at}
              <div>
                v{secret.version}, {secret.created_by}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AuditTable({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">записей нет</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-muted-foreground">
        <tr>
          <th className="border-b border-border py-2 pr-3">Когда</th>
          <th className="border-b border-border py-2 pr-3">Кто</th>
          <th className="border-b border-border py-2 pr-3">Что</th>
          <th className="border-b border-border py-2">Секрет</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={`${entry.ts}:${entry.actor}:${entry.action}`}>
            <td className="border-b border-border py-2 pr-3 text-xs text-muted-foreground">
              {entry.ts}
            </td>
            <td className="border-b border-border py-2 pr-3">
              {entry.actor}{" "}
              <span className="text-xs text-muted-foreground">
                ({entry.role})
              </span>
            </td>
            <td className="border-b border-border py-2 pr-3">{entry.action}</td>
            <td className="border-b border-border py-2 text-xs">
              {entry.project}/{entry.name}
              {entry.detail ? (
                <div className="text-muted-foreground">{entry.detail}</div>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
