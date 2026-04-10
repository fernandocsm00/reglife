"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { RETAKE_COOLDOWN_DAYS, type SavedPlan } from "@/lib/poker/planStorage";

interface Props {
  open: boolean;
  onClose: () => void;
  plan: SavedPlan;
}

export function RetakeModal({ open, onClose, plan }: Props) {
  const router = useRouter();
  const willLock = plan.attempts >= 1;

  const handleConfirm = () => {
    router.push("/diagnostico?retake=1");
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className="max-w-md rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-100 shadow-xl"
          >
            <div className="text-2xl">⚠️</div>
            <h3 className="mt-2 text-lg font-bold">
              Você já tem um plano ativo
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-neutral-300">
              Refazer o nivelamento vai{" "}
              <span className="font-semibold text-amber-300">
                apagar seu plano atual
              </span>{" "}
              e gerar um novo. Sua primeira tentativa costuma ser a mais
              honesta — ela revela seus leaks reais.
            </p>
            {willLock && (
              <p className="mt-3 text-xs text-neutral-500">
                Após esse retake, o nivelamento ficará bloqueado por{" "}
                {RETAKE_COOLDOWN_DAYS} dias. Esse cooldown existe pra você
                estudar de verdade — não pra tirar uma "nota melhor".
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
              >
                Voltar pro meu plano
              </button>
              <button
                onClick={handleConfirm}
                className="rounded-md bg-amber-300 px-4 py-2 text-sm font-bold text-neutral-950 transition hover:bg-amber-200"
              >
                Sim, quero refazer
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
