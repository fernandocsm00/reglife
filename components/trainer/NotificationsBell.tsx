"use client";

/**
 * Sino de notificações + dropdown com lista. Usa /api/profile/notifications.
 * Auto-fetch ao montar; refetch a cada 60s; marcar como lido ao abrir.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";

interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  read_at: string | null;
  channels_sent: string[] | null;
}

interface Props {
  diagnosticId: string | undefined;
}

const ICON_BY_KIND: Record<string, string> = {
  post_session: "♠️",
  streak_risk: "🔥",
  quest_assigned: "🎯",
  quest_done: "🏁",
  quest_expiring: "⏳",
  drop_active: "⚡",
  badge_unlocked: "🏅",
  leak_alert: "🎯",
  phase_transition: "🚀",
};

export function NotificationsBell({ diagnosticId }: Props) {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!diagnosticId) return;
    let canceled = false;
    const load = async () => {
      try {
        const res = await fetch(
          `/api/profile/notifications?userId=diag:${diagnosticId}`
        );
        const data = await res.json();
        if (!canceled) setItems(data.notifications ?? []);
      } catch { /* ignore */ }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      canceled = true;
      clearInterval(t);
    };
  }, [diagnosticId]);

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const unreadCount = items.filter((n) => !n.read_at).length;

  async function markAllRead() {
    if (!diagnosticId || unreadCount === 0) return;
    setItems((prev) =>
      prev.map((n) =>
        n.read_at ? n : { ...n, read_at: new Date().toISOString() }
      )
    );
    fetch("/api/profile/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: `diag:${diagnosticId}` }),
    }).catch(() => {});
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) markAllRead();
        }}
        className="relative rounded-full border border-neutral-800 bg-neutral-900/80 p-2 text-neutral-300 transition hover:border-amber-400/40 hover:text-amber-300"
        aria-label={`Notificações ${unreadCount > 0 ? `(${unreadCount} novas)` : ""}`}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-bold text-neutral-950">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 z-30 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Avisos do Rex
              </span>
              <Link
                href="/manager"
                className="text-[11px] text-amber-300 hover:underline"
                onClick={() => setOpen(false)}
              >
                Falar com Rex →
              </Link>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-neutral-500">
                  Nada por aqui ainda. O Rex avisa quando tiver algo relevante.
                </p>
              ) : (
                items.map((n) => (
                  <div
                    key={n.id}
                    className={`flex gap-3 border-b border-neutral-900 px-4 py-3 text-xs last:border-b-0 ${
                      n.read_at ? "opacity-60" : ""
                    }`}
                  >
                    <span className="mt-0.5 text-base">
                      {ICON_BY_KIND[n.kind] ?? "🔔"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-neutral-200">{n.title}</p>
                      {n.body && (
                        <p className="mt-0.5 text-neutral-400 line-clamp-3">
                          {n.body}
                        </p>
                      )}
                      <p className="mt-1 text-[10px] text-neutral-600">
                        {formatRelative(n.created_at)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2zM10 21a2 2 0 0 0 4 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  return `${d}d`;
}
