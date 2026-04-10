"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Logo } from "@/components/Logo";
import type { MonthlyVolume, StudyTime } from "@/lib/poker/planStorage";

export interface OnboardingData {
  playerName: string;
  email: string;
  phone: string;
  studyTime: StudyTime;
  monthlyVolume: MonthlyVolume;
}

interface Props {
  onSubmit: (data: OnboardingData) => void;
}

const STUDY_OPTIONS: { id: StudyTime; label: string }[] = [
  { id: "ate15", label: "Até 15h semanais" },
  { id: "ate40", label: "Até 40h semanais" },
  { id: "mais40", label: "Mais de 40h semanais" },
];

const VOLUME_OPTIONS: { id: MonthlyVolume; label: string }[] = [
  { id: "ate50", label: "50 jogos ou menos" },
  { id: "50a100", label: "50 a 100 jogos" },
  { id: "100a300", label: "100 a 300 jogos" },
  { id: "mais300", label: "Mais de 300 jogos" },
];

// Formata o celular enquanto o usuário digita: (99) 99999-9999
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string): boolean {
  return phone.replace(/\D/g, "").length >= 10;
}

export function OnboardingForm({ onSubmit }: Props) {
  const [playerName, setPlayerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [studyTime, setStudyTime] = useState<StudyTime>("ate15");
  const [monthlyVolume, setMonthlyVolume] = useState<MonthlyVolume>("ate50");

  const canSubmit =
    playerName.trim().length >= 2 && isValidEmail(email) && isValidPhone(phone);

  return (
    <div className="relative min-h-screen overflow-hidden bg-neutral-950 text-neutral-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400/10 blur-[150px]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 py-16">
        <Logo size="lg" className="mb-6" />

        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center text-3xl font-bold"
        >
          Antes de começar
        </motion.h1>
        <p className="mt-3 max-w-md text-center text-sm text-neutral-400">
          Vamos personalizar seu plano de 90 dias com base no seu ritmo de
          estudo e volume de jogos.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            onSubmit({
              playerName: playerName.trim(),
              email: email.trim().toLowerCase(),
              phone,
              studyTime,
              monthlyVolume,
            });
          }}
          className="mt-10 w-full space-y-6"
        >
          <Field label="Seu nome">
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Ex: Léo"
              className={inputClass}
              autoFocus
            />
          </Field>

          <Field label="E-mail usado na comunidade reglife">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
              className={inputClass}
              inputMode="email"
              autoComplete="email"
            />
          </Field>

          <Field label="Celular">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder="(11) 99999-9999"
              className={inputClass}
              inputMode="tel"
              autoComplete="tel"
            />
          </Field>

          <Field label="Tempo disponível para estudar por semana">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {STUDY_OPTIONS.map((opt) => (
                <OptionButton
                  key={opt.id}
                  selected={studyTime === opt.id}
                  onClick={() => setStudyTime(opt.id)}
                  label={opt.label}
                />
              ))}
            </div>
          </Field>

          <Field label="Seu volume de jogos por mês">
            <div className="grid grid-cols-2 gap-2">
              {VOLUME_OPTIONS.map((opt) => (
                <OptionButton
                  key={opt.id}
                  selected={monthlyVolume === opt.id}
                  onClick={() => setMonthlyVolume(opt.id)}
                  label={opt.label}
                />
              ))}
            </div>
          </Field>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-md bg-amber-300 px-6 py-3 text-base font-bold text-neutral-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Começar o nivelamento →
          </button>

          <p className="text-center text-[11px] text-neutral-600">
            Seus dados ficam salvos apenas no seu navegador pra personalizar o
            plano. Responda com calma — seu plano depende da honestidade do que
            você jogar agora.
          </p>
        </form>
      </div>
    </div>
  );
}

const inputClass =
  "mt-2 w-full rounded-md border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-base text-neutral-100 outline-none transition focus:border-amber-400/60";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </label>
      {children}
    </div>
  );
}

function OptionButton({
  selected,
  onClick,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-2.5 text-xs font-medium transition ${
        selected
          ? "border-amber-400 bg-amber-400/10 text-amber-300"
          : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
      }`}
    >
      {label}
    </button>
  );
}
