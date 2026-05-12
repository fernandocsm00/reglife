"use client";

/**
 * Card de configurações de canal de notificação.
 * Self-service em /meu-plano. Não requer auth.
 */

import { useEffect, useState } from "react";
import { motion } from "motion/react";

interface Settings {
  discord_webhook_url: string | null;
  whatsapp_phone: string | null;
  notify_channels: string[] | null;
  notify_quiet_start: number | null;
  notify_quiet_end: number | null;
  timezone: string | null;
}

interface Props {
  diagnosticId: string | undefined;
}

export function NotifySettings({ diagnosticId }: Props) {
  const [s, setS] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!diagnosticId) {
      setLoading(false);
      return;
    }
    fetch(`/api/profile/notifications?userId=diag:${diagnosticId}`)
      .then((r) => r.json())
      .then((data) => setS(data.settings ?? defaultSettings()))
      .catch(() => setS(defaultSettings()))
      .finally(() => setLoading(false));
  }, [diagnosticId]);

  if (!diagnosticId || loading || !s) return null;

  const channels = new Set(s.notify_channels ?? ["in_app"]);
  const toggle = (c: string) => {
    const next = new Set(channels);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    next.add("in_app"); // sempre on
    setS({ ...s, notify_channels: Array.from(next) });
  };

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/profile/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: `diag:${diagnosticId}`,
          settings: s,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erro ao salvar");
      } else {
        setSavedAt(Date.now());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro de rede");
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5 print:hidden"
    >
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Como o EV te avisa
      </p>
      <p className="mb-4 text-xs text-neutral-500">
        In-app é sempre ligado. Discord e WhatsApp são opcionais — escolha o
        que faz sentido pra você.
      </p>

      {/* Canais */}
      <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <ChannelToggle label="In-app" enabled disabled />
        <ChannelToggle
          label="Discord"
          enabled={channels.has("discord")}
          onToggle={() => toggle("discord")}
        />
        <ChannelToggle
          label="WhatsApp"
          enabled={channels.has("whatsapp")}
          onToggle={() => toggle("whatsapp")}
        />
      </div>

      {/* Discord webhook */}
      {channels.has("discord") && (
        <Field label="Discord webhook URL" hint="No Discord, abra DM com você mesmo · Editar canal · Integrações · Webhooks · Novo · Copiar URL">
          <input
            type="url"
            value={s.discord_webhook_url ?? ""}
            onChange={(e) => setS({ ...s, discord_webhook_url: e.target.value })}
            placeholder="https://discord.com/api/webhooks/..."
            className={inputClass}
          />
        </Field>
      )}

      {/* WhatsApp phone */}
      {channels.has("whatsapp") && (
        <Field label="WhatsApp" hint="Com DDD. Ex: 11999998888">
          <input
            type="tel"
            inputMode="tel"
            value={s.whatsapp_phone ?? ""}
            onChange={(e) =>
              setS({ ...s, whatsapp_phone: e.target.value.replace(/\D/g, "") })
            }
            placeholder="11999998888"
            className={inputClass}
          />
        </Field>
      )}

      {/* Quiet hours */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Não me avise depois das">
          <select
            value={s.notify_quiet_start ?? 23}
            onChange={(e) =>
              setS({ ...s, notify_quiet_start: parseInt(e.target.value, 10) })
            }
            className={inputClass}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {h.toString().padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </Field>
        <Field label="Volta a avisar às">
          <select
            value={s.notify_quiet_end ?? 9}
            onChange={(e) =>
              setS({ ...s, notify_quiet_end: parseInt(e.target.value, 10) })
            }
            className={inputClass}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {h.toString().padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-amber-300 px-4 py-2 text-sm font-bold text-neutral-950 transition hover:bg-amber-200 disabled:opacity-40"
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
        {savedAt && !error && (
          <span className="text-xs text-emerald-400">Salvo</span>
        )}
      </div>
    </motion.div>
  );
}

function defaultSettings(): Settings {
  return {
    discord_webhook_url: null,
    whatsapp_phone: null,
    notify_channels: ["in_app"],
    notify_quiet_start: 23,
    notify_quiet_end: 9,
    timezone: "America/Sao_Paulo",
  };
}

function ChannelToggle({
  label,
  enabled,
  onToggle,
  disabled = false,
}: {
  label: string;
  enabled: boolean;
  onToggle?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      className={`rounded-md border px-3 py-2 text-xs font-medium transition ${
        enabled
          ? "border-amber-400/60 bg-amber-400/10 text-amber-300"
          : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
      } ${disabled ? "cursor-default opacity-80" : ""}`}
    >
      {enabled ? "✓ " : ""}
      {label}
    </button>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <label className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-neutral-600">{hint}</p>}
    </div>
  );
}

const inputClass =
  "mt-1.5 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none transition focus:border-amber-400/60";
