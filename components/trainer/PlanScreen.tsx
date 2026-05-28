"use client";

import { motion } from "motion/react";
import { useState } from "react";
import Link from "next/link";
import type { SavedPlan } from "@/lib/poker/planStorage";
import { Logo } from "@/components/Logo";
import { EvHud } from "./EvHud";
import { PulseCard } from "./PulseCard";
import { RetakeModal } from "./RetakeModal";
import { SpotTrack } from "./SpotTrack";
import { ResourcesBlock } from "./ResourcesBlock";

interface Props {
  plan: SavedPlan;
  onPlanChange: (plan: SavedPlan) => void;
}

export function PlanScreen({ plan }: Props) {
  const [showRetake, setShowRetake] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  /**
   * Abre o PDF do plano em nova aba.
   *
   * Estratégia em 2 passos:
   * 1. Tenta /r/{id} via GET — caminho stateless, funciona se saved_plan
   *    estiver na DB ou se o PDF já existir no Storage.
   * 2. Se falhar (saved_plan null + PDF não existe), faz POST direto pra
   *    /api/plan/pdf mandando o savedPlan do localStorage. Esse path
   *    regenera o PDF E atualiza saved_plan na DB pra próximos acessos.
   */
  async function handleDownloadPdf() {
    if (!plan.diagnosticId) return;
    if (pdfLoading) return;

    setPdfLoading(true);
    // Abre uma janela em branco já no clique (evita popup blocker)
    const popup = window.open("about:blank", "_blank");

    try {
      const res = await fetch("/api/plan/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diagnosticId: plan.diagnosticId,
          savedPlan: plan,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null;
      if (!res.ok || !data?.url) {
        const errMsg = data?.error ?? `Erro ${res.status}`;
        if (popup) popup.close();
        alert(`Não consegui gerar o PDF: ${errMsg}. Tenta refazer em alguns minutos.`);
        return;
      }
      if (popup) popup.location.href = data.url;
      else window.open(data.url, "_blank");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (popup) popup.close();
      alert(`Não consegui gerar o PDF: ${msg}`);
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="rg-root min-h-screen print:bg-white print:text-black">
      <div
        className="mx-auto"
        style={{ maxWidth: 720, padding: "40px 24px 56px" }}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between gap-4 print:hidden">
          <Link
            href="/"
            className="rg-meta"
            style={{ color: "var(--rg-fg-subtle)", textDecoration: "none" }}
          >
            ← Início
          </Link>
        </div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.2, 0.7, 0.3, 1] }}
          style={{ marginTop: 28, marginBottom: 32 }}
        >
          <Logo size="md" />
          <h1
            className="rg-display"
            style={{ marginTop: 28, color: "var(--rg-fg)" }}
          >
            Plano de Progressão Individual — {plan.playerName}.
          </h1>
        </motion.div>

        {/* EV — Manager de Evolução (chat IA com contexto de Sharkscope) */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: 0.03,
            duration: 0.22,
            ease: [0.2, 0.7, 0.3, 1],
          }}
          style={{ marginBottom: 16 }}
        >
          <Link
            href="/manager"
            className="group flex flex-col rounded-xl border border-amber-400/20 bg-amber-400/5 p-5 transition hover:border-amber-400/40 hover:bg-amber-400/8 print:hidden"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-neutral-950">
                R
              </div>
              <span className="flex items-center gap-1 text-[10px] text-green-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                online
              </span>
            </div>
            <p className="text-sm font-semibold text-amber-300">EV — Manager de Evolução</p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-400">
              Acompanha seu plano, lê seus resultados do SharkScope e te
              cobra quando precisa. Bate um papo, tira dúvida, ajusta rota.
            </p>
            <span className="mt-4 text-xs text-neutral-500 transition group-hover:text-amber-300">
              Abrir chat →
            </span>
          </Link>
        </motion.div>

        {/* EvHud — Streak / XP / Volume / Quest */}
        {plan.diagnosticId && (
          <div style={{ marginBottom: 24 }}>
            <EvHud
              diagnosticId={plan.diagnosticId}
              fallbackVolumeTarget={plan.volumeTargetWeekly ?? null}
            />
          </div>
        )}

        {/* PulseCard — pulse semanal (4 emojis), some após votar */}
        {plan.diagnosticId && (
          <div style={{ marginBottom: 24 }}>
            <PulseCard diagnosticId={plan.diagnosticId} />
          </div>
        )}

        {/* PDF hero — entrega principal */}
        {plan.diagnosticId && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.05,
              duration: 0.22,
              ease: [0.2, 0.7, 0.3, 1],
            }}
            className="rg-card rg-card--accent relative overflow-hidden print:hidden"
            style={{ borderRadius: "var(--rg-r-xl)", padding: 28 }}
          >
            <div
              className="pointer-events-none absolute -right-20 -top-20 rounded-full"
              style={{
                width: 256,
                height: 256,
                background: "var(--rg-accent-bg-12)",
                filter: "blur(100px)",
              }}
            />
            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="rg-h2">
                  Baixe seu plano em PDF
                </h2>
              </div>
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={pdfLoading}
                className="rg-btn rg-btn--primary rg-btn--lg shrink-0"
                style={{
                  borderRadius: "var(--rg-r-pill)",
                  opacity: pdfLoading ? 0.7 : 1,
                  cursor: pdfLoading ? "wait" : "pointer",
                }}
              >
                {pdfLoading ? (
                  <span
                    className="inline-block animate-spin rounded-full border-2 border-current border-r-transparent"
                    style={{ width: 14, height: 14 }}
                  />
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                )}
                {pdfLoading ? "Gerando…" : "Baixar meu plano"}
              </button>
            </div>
          </motion.div>
        )}

        <SpotTrack plan={plan} />
        <ResourcesBlock plan={plan} />

        {/* Footer */}
        <div
          className="print:hidden"
          style={{
            marginTop: 48,
            paddingTop: 24,
            borderTop: "1px solid var(--rg-border)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          {/* Mesmo PDF do card destacado em cima — chama o mesmo handler
              em vez de window.print(). Some quando não tem diagnosticId
              (lead em estado quebrado) — sem id não dá pra gerar/baixar. */}
          {plan.diagnosticId && (
            <button
              onClick={handleDownloadPdf}
              disabled={pdfLoading}
              className="rg-btn rg-btn--ghost rg-btn--sm"
              style={{
                opacity: pdfLoading ? 0.7 : 1,
                cursor: pdfLoading ? "wait" : "pointer",
              }}
            >
              {pdfLoading ? "Gerando…" : "Baixar PDF"}
            </button>
          )}
          <button
            onClick={() => setShowRetake(true)}
            className="rg-btn rg-btn--ghost rg-btn--sm"
          >
            Refazer nivelamento
          </button>
        </div>
      </div>

      <RetakeModal open={showRetake} onClose={() => setShowRetake(false)} />
    </div>
  );
}
