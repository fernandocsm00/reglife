"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Logo } from "@/components/Logo";
import type { ProfitGoal, StudyTime } from "@/lib/poker/planStorage";
import {
  ABI_OPTIONS,
  BANCA_OPTIONS,
  IDADE_OPTIONS,
  OBJETIVO_OPTIONS,
  TEMPO_OPTIONS,
  VOLUME_OPTIONS,
  computeLeadCategory,
  computeLeadScore,
  computeStakeGrade,
  defaultStudyTime,
  objetivoToProfitGoal,
  volumeToWeeklyTarget,
  type AbiAnswer,
  type BancaAnswer,
  type IdadeAnswer,
  type LeadCategory,
  type ObjetivoAnswer,
  type QuizAnswers,
  type QuizOption,
  type TempoAnswer,
  type VolumeAnswer,
} from "@/lib/poker/leadScoring";

export interface OnboardingData {
  playerName: string;
  email: string;
  phone: string;
  notifyChannels: string[];
  whatsappPhone: string | null;
  quizAnswers: QuizAnswers;
  // Lead scoring (computed) — admin-side only, lead não vê
  leadScore: number;
  leadCategory: LeadCategory;
  stakeGrade: number;
  // Legacy fields derivados do quiz — alimentam planBuilder
  studyTime: StudyTime;
  profitGoal: ProfitGoal;
  volumeTargetWeekly: number;
}

interface Props {
  onSubmit: (data: OnboardingData) => void;
}

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

type Step = 1 | 2 | 3;

export function OnboardingForm({ onSubmit }: Props) {
  const [step, setStep] = useState<Step>(1);

  // Step 1 — Identificação
  const [playerName, setPlayerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState("");

  // Step 2 — Quem você é (3 perguntas pontuadas)
  const [idade, setIdade] = useState<IdadeAnswer | null>(null);
  const [tempo, setTempo] = useState<TempoAnswer | null>(null);
  const [objetivo, setObjetivo] = useState<ObjetivoAnswer | null>(null);

  // Step 3 — Seus números
  const [abi, setAbi] = useState<AbiAnswer | null>(null);
  const [volume, setVolume] = useState<VolumeAnswer | null>(null);
  const [banca, setBanca] = useState<BancaAnswer | null>(null);

  const step1Valid =
    playerName.trim().length >= 2 &&
    isValidEmail(email) &&
    isValidPhone(phone) &&
    (notifyEmail || notifyWhatsapp) &&
    (!notifyWhatsapp || whatsappPhone.trim().length > 0);

  const step2Valid = idade !== null && tempo !== null && objetivo !== null;
  const step3Valid = abi !== null && volume !== null && banca !== null;

  const finalSubmit = () => {
    if (!step1Valid || !step2Valid || !step3Valid) return;

    const quizAnswers: QuizAnswers = {
      idade: idade!,
      tempo: tempo!,
      objetivo: objetivo!,
      abi: abi!,
      volume: volume!,
      banca: banca!,
    };

    const leadScore = computeLeadScore(quizAnswers);
    const leadCategory = computeLeadCategory(leadScore);
    const stakeGrade = computeStakeGrade(quizAnswers);

    const notifyChannels: string[] = [];
    if (notifyEmail) notifyChannels.push("email");
    if (notifyWhatsapp) notifyChannels.push("whatsapp");

    onSubmit({
      playerName: playerName.trim(),
      email: email.trim().toLowerCase(),
      phone,
      notifyChannels,
      whatsappPhone: notifyWhatsapp ? whatsappPhone.trim() : null,
      quizAnswers,
      leadScore,
      leadCategory,
      stakeGrade,
      studyTime: defaultStudyTime(),
      profitGoal: objetivoToProfitGoal(objetivo!),
      volumeTargetWeekly: volumeToWeeklyTarget(volume!),
    });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-neutral-950 text-neutral-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400/10 blur-[150px]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 py-16">
        <Logo size="lg" className="mb-6" />

        <ProgressDots current={step} />

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
              className="w-full"
            >
              <h1 className="mt-6 text-center text-3xl font-bold">
                Antes de começar
              </h1>
              <p className="mt-3 text-center text-sm text-neutral-400">
                Personalizamos a sua experiência. Leva 2 minutos.
              </p>

              <div className="mt-10 space-y-6">
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

                <Field label="E-mail">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@email.com"
                    className={inputClass}
                    inputMode="email"
                    autoComplete="email"
                    required
                  />
                </Field>

                <Field label="WhatsApp">
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

                <fieldset className="rounded-md border border-neutral-800 p-3">
                  <legend className="px-2 text-xs font-semibold text-neutral-300">
                    Como você quer receber seu relatório
                  </legend>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyEmail}
                      onChange={(e) => setNotifyEmail(e.target.checked)}
                    />
                    <span>Email (será enviado pro endereço acima)</span>
                  </label>
                  <label className="mt-2 flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyWhatsapp}
                      onChange={(e) => {
                        setNotifyWhatsapp(e.target.checked);
                        if (e.target.checked && !whatsappPhone)
                          setWhatsappPhone(phone);
                      }}
                    />
                    <span>WhatsApp</span>
                  </label>
                  {notifyWhatsapp && (
                    <input
                      type="tel"
                      value={whatsappPhone}
                      onChange={(e) => setWhatsappPhone(e.target.value)}
                      placeholder="Confirme o número (com DDI)"
                      className="mt-2 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
                      required={notifyWhatsapp}
                    />
                  )}
                </fieldset>
              </div>

              <div className="mt-10 flex justify-end">
                <NextButton
                  disabled={!step1Valid}
                  onClick={() => setStep(2)}
                  label="Continuar →"
                />
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
              className="w-full"
            >
              <h1 className="mt-6 text-center text-3xl font-bold">
                Sobre você
              </h1>
              <p className="mt-3 text-center text-sm text-neutral-400">
                3 perguntas rápidas pra entender seu perfil.
              </p>

              <div className="mt-10 space-y-8">
                <QuizQuestion
                  question="Qual é a sua idade?"
                  options={IDADE_OPTIONS}
                  value={idade}
                  onChange={setIdade}
                />
                <QuizQuestion
                  question="Há quanto tempo você joga poker?"
                  options={TEMPO_OPTIONS}
                  value={tempo}
                  onChange={setTempo}
                />
                <QuizQuestion
                  question="Qual é o seu objetivo no poker?"
                  options={OBJETIVO_OPTIONS}
                  value={objetivo}
                  onChange={setObjetivo}
                />
              </div>

              <div className="mt-10 flex items-center justify-between">
                <BackButton onClick={() => setStep(1)} />
                <NextButton
                  disabled={!step2Valid}
                  onClick={() => setStep(3)}
                  label="Continuar →"
                />
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
              className="w-full"
            >
              <h1 className="mt-6 text-center text-3xl font-bold">
                Seus números
              </h1>
              <p className="mt-3 text-center text-sm text-neutral-400">
                Últimas 3 perguntas. Tudo conforme o seu SharkScope dos últimos 6 meses.
              </p>

              <div className="mt-10 space-y-8">
                <QuizQuestion
                  question="Qual é o seu ABI (buy-in médio) em dólares?"
                  options={ABI_OPTIONS}
                  value={abi}
                  onChange={setAbi}
                />
                <QuizQuestion
                  question="Quantos torneios você joga por mês?"
                  options={VOLUME_OPTIONS}
                  value={volume}
                  onChange={setVolume}
                />
                <QuizQuestion
                  question="Qual é a sua banca total (em dólares) agora?"
                  hint="Não é só o que tem na sala — é todo o dinheiro disponível pra dar buy-ins, incluindo o que você consegue depositar."
                  options={BANCA_OPTIONS}
                  value={banca}
                  onChange={setBanca}
                />
              </div>

              <div className="mt-10 flex items-center justify-between">
                <BackButton onClick={() => setStep(2)} />
                <NextButton
                  disabled={!step3Valid}
                  onClick={finalSubmit}
                  label="Começar o teste →"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponentes
// ---------------------------------------------------------------------------

function ProgressDots({ current }: { current: Step }) {
  return (
    <div className="flex gap-2">
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={`h-1.5 w-8 rounded-full transition-colors ${
            n <= current ? "bg-amber-400" : "bg-neutral-800"
          }`}
        />
      ))}
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none transition focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function QuizQuestion<T extends string>({
  question,
  hint,
  options,
  value,
  onChange,
}: {
  question: string;
  hint?: string;
  options: QuizOption<T>[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  // useMemo só pra evitar reordenação inesperada
  const opts = useMemo(() => options, [options]);

  return (
    <div>
      <p className="text-sm font-semibold text-neutral-200">{question}</p>
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
      <div className="mt-3 space-y-2">
        {opts.map((o) => {
          const selected = value === o.value;
          return (
            <button
              type="button"
              key={o.value}
              onClick={() => onChange(o.value)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                selected
                  ? "border-amber-400/60 bg-amber-400/10 text-amber-100"
                  : "border-neutral-800 bg-neutral-900/50 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-900"
              }`}
            >
              <span>{o.label}</span>
              <span
                className={`h-3.5 w-3.5 shrink-0 rounded-full border ${
                  selected ? "border-amber-400 bg-amber-400" : "border-neutral-700"
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NextButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition ${
        disabled
          ? "cursor-not-allowed bg-neutral-800 text-neutral-500"
          : "bg-amber-400 text-neutral-950 hover:bg-amber-300"
      }`}
    >
      {label}
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-sm text-neutral-400 transition hover:text-neutral-200"
    >
      ← Voltar
    </button>
  );
}
