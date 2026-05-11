"use client";

/**
 * RexHud — barra horizontal de status persistente em /meu-plano.
 *
 * Mostra os 4 sinais que importam pro aluno:
 *   🔥 Streak | ⚡ XP semana | 🎯 Volume da semana / target | 🏁 Quest ativa
 *
 * Lê via GET /api/plan/progress?userId=diag:<id>. Atualiza a cada visita.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  fetchPlanProgress,
  type ActiveQuest,
  type PlanProgressSummary,
} from "@/lib/poker/progress";

interface Props {
  diagnosticId: string | undefined;
  /** Fallback se a API ainda não retornou — vem do plano local. */
  fallbackVolumeTarget: number | null;
}

export function RexHud({ diagnosticId, fallbackVolumeTarget }: Props) {
  const [data, setData] = useState<PlanProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetchPlanProgress(diagnosticId).then((d) => {
      if (mounted) {
        setData(d);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, [diagnosticId]);

  const volumeTarget = data?.volumeTarget ?? fallbackVolumeTarget;
  const weeklyVolume = data?.weeklyVolume ?? 0;
  const volumePct =
    volumeTarget && volumeTarget > 0
      ? Math.min(100, Math.round((weeklyVolume / volumeTarget) * 100))
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 sm:p-4 print:hidden"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          icon="🔥"
          label="Streak"
          value={loading ? "—" : `${data?.currentStreak ?? 0}d`}
          accent="amber"
        />
        <Stat
          icon="⚡"
          label="XP semana"
          value={loading ? "—" : (data?.weeklyXp ?? 0).toString()}
          sub={data ? `${data.totalXp} total` : undefined}
          accent="amber"
        />
        <Stat
          icon="🎯"
          label="Volume"
          value={
            volumeTarget
              ? `${weeklyVolume}/${volumeTarget}`
              : loading
                ? "—"
                : "—"
          }
          sub={volumePct !== null ? `${volumePct}%` : "sem meta"}
          accent={volumePct !== null && volumePct >= 80 ? "emerald" : "neutral"}
        />
        <Stat
          icon="🏁"
          label="Quest"
          value={
            data?.activeQuest
              ? `${data.activeQuest.progress}/${data.activeQuest.target_count}`
              : loading
                ? "—"
                : "—"
          }
          sub={data?.activeQuest?.title ?? "nenhuma ativa"}
          accent={data?.activeQuest?.completed_at ? "emerald" : "neutral"}
        />
      </div>

      {data?.activeQuest && (
        <QuestRow quest={data.activeQuest} diagnosticId={diagnosticId} />
      )}
    </motion.div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  accent: "amber" | "emerald" | "neutral";
}) {
  const valueColor =
    accent === "amber"
      ? "text-amber-300"
      : accent === "emerald"
        ? "text-emerald-400"
        : "text-neutral-200";
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline gap-2">
        <span className="text-base">{icon}</span>
        <span className="text-[10px] uppercase tracking-wide text-neutral-500">
          {label}
        </span>
      </div>
      <div className={`mt-1 text-lg font-bold tabular-nums ${valueColor}`}>
        {value}
      </div>
      {sub && (
        <div className="text-[11px] text-neutral-500 truncate" title={sub}>
          {sub}
        </div>
      )}
    </div>
  );
}

function QuestRow({
  quest,
  diagnosticId,
}: {
  quest: ActiveQuest;
  diagnosticId: string | undefined;
}) {
  const pct = Math.min(
    100,
    Math.round((quest.progress / quest.target_count) * 100)
  );
  const expired = new Date(quest.expires_at).getTime() < Date.now();
  const completed = !!quest.completed_at;

  return (
    <div className="mt-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-3 text-xs">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-neutral-200">
            {quest.title}
          </p>
          {quest.description && (
            <p className="mt-0.5 line-clamp-2 text-neutral-500">
              {quest.description}
            </p>
          )}
        </div>
        <Link
          href="/manager"
          className="shrink-0 rounded-md border border-neutral-700 px-2 py-1 text-[10px] text-neutral-300 transition hover:border-amber-400/40 hover:text-amber-300"
          title={`Quest da semana${diagnosticId ? "" : ""}`}
        >
          Falar com Rex
        </Link>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800">
        <div
          className={`h-full rounded-full ${
            completed ? "bg-emerald-500" : expired ? "bg-red-500" : "bg-amber-400"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-neutral-500">
        <span>
          {completed
            ? `✓ Concluída · +${quest.reward_xp} XP`
            : expired
              ? "Expirada"
              : `${quest.target_count - quest.progress} faltando`}
        </span>
        <span>
          {completed
            ? ""
            : `Até ${new Date(quest.expires_at).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
              })}`}
        </span>
      </div>
    </div>
  );
}
