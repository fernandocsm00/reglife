/**
 * /manager — Página do Manager.IA (EV)
 *
 * Por enquanto usa dados do localStorage (plano atual) enquanto a Fase 1
 * de auth + Supabase não está implementada.
 * Quando o auth estiver pronto, os dados virão do banco diretamente.
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getStoredPlan, type SavedPlan } from "@/lib/poker/planStorage";
import { ManagerChat } from "@/components/manager/ManagerChat";
import { Logo } from "@/components/Logo";

export default function ManagerPage() {
  const [plan, setPlan] = useState<SavedPlan | null | undefined>(undefined);

  useEffect(() => {
    setPlan(getStoredPlan());
  }, []);

  if (plan === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-300 border-t-transparent" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-6 text-center text-neutral-100">
        <Logo size="lg" className="mb-6" />
        <h1 className="text-2xl font-bold">Você ainda não tem um plano</h1>
        <p className="mt-3 max-w-md text-sm text-neutral-400">
          Faça o nivelamento primeiro para ativar o EV — seu Manager de Evolução.
        </p>
        <Link
          href="/diagnostico"
          className="mt-8 rounded-md bg-amber-300 px-6 py-2 text-sm font-bold text-neutral-950 transition hover:bg-amber-200"
        >
          Começar nivelamento →
        </Link>
      </div>
    );
  }

  // Sem auth nessa fase: usa o id da linha em reglife_diagnostic_results
  // pra que o EV consiga carregar SharkScope e contexto. Se não tiver
  // (plano antigo gerado antes do POST capturar id), cai pro temp_*.
  const tempUserId = plan.diagnosticId
    ? `diag:${plan.diagnosticId}`
    : plan.email
      ? `temp_${btoa(plan.email).replace(/[^a-z0-9]/gi, "")}`
      : `temp_${plan.id}`;

  const cycleDay = Math.max(
    1,
    Math.floor((Date.now() - plan.createdAt) / (1000 * 60 * 60 * 24)) + 1
  );

  const currentPhase =
    cycleDay <= 30
      ? "Fase 1 – Fundamentos"
      : cycleDay <= 60
      ? "Fase 2 – Aplicação"
      : "Fase 3 – Integração";

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      {/* Nav superior */}
      <nav className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <div className="flex items-center gap-4">
          <Logo size="sm" />
          <div className="hidden sm:flex items-center gap-1 text-xs text-neutral-500">
            <Link href="/meu-plano" className="hover:text-neutral-300 transition">
              Meu Plano
            </Link>
            <span>·</span>
            <span className="text-amber-300">EV</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-500">{currentPhase}</span>
          <Link
            href="/meu-plano"
            className="rounded-md border border-neutral-700 px-3 py-1 text-xs text-neutral-300 transition hover:border-amber-400/50 hover:text-amber-300"
          >
            Ver plano
          </Link>
        </div>
      </nav>

      {/* Chat */}
      <div className="flex-1 overflow-hidden">
        <ManagerChat
          userId={tempUserId}
          playerName={plan.playerName}
          currentStreak={0} // TODO: buscar do Supabase após auth
          weeklyXp={0}       // TODO: buscar do Supabase após auth
          totalXp={0}
          cycleDay={cycleDay}
          currentPhase={currentPhase}
          plan={plan}
        />
      </div>
    </div>
  );
}
