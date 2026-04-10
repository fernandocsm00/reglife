"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getStoredPlan, type SavedPlan } from "@/lib/poker/planStorage";
import { PlanScreen } from "./PlanScreen";
import { Logo } from "@/components/Logo";

export function MeuPlanoClient() {
  const [plan, setPlan] = useState<SavedPlan | null | undefined>(undefined);

  useEffect(() => {
    setPlan(getStoredPlan());
  }, []);

  if (plan === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950 text-neutral-400">
        Carregando seu plano…
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-6 text-center text-neutral-100">
        <Logo size="lg" className="mb-6" />
        <h1 className="text-2xl font-bold">Você ainda não tem um plano</h1>
        <p className="mt-3 max-w-md text-sm text-neutral-400">
          Faça o nivelamento da reglife para receber seu plano de 90 dias
          personalizado.
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

  return <PlanScreen plan={plan} onPlanChange={setPlan} />;
}
