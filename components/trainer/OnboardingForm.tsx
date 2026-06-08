"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
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
  leadScore: number;
  leadCategory: LeadCategory;
  stakeGrade: number;
  studyTime: StudyTime;
  profitGoal: ProfitGoal;
  volumeTargetWeekly: number;
  notifyCadence: "leve" | "ritmada" | "intensa";
  /**
   * Consentimento explícito do aluno pra receber contatos via WhatsApp na
   * Comunidade. Substituiu a pergunta antiga de cadência no passo 9.
   * - true  → aceitou
   * - false → recusou
   */
  whatsappOptIn: boolean;
  /** Nick SharkScope informado no step 7 — null se aluno opt-out. */
  sharkscopeUsername: string | null;
  /** Network SharkScope informado no step 7 — null se aluno opt-out. */
  sharkscopeNetwork: string | null;
}

interface Props {
  onSubmit: (data: OnboardingData) => void;
}

const TOTAL_STEPS = 9; // 1 identidade + 6 perguntas + 1 nick SharkScope + 1 banca + 1 opt-in WhatsApp

const SHARKSCOPE_NETWORKS = [
  "PokerStars",
  "GGPoker",
  "PartyPoker",
  "888Poker",
  "WPN",
  "iPoker",
] as const;
type SharkscopeNetwork = (typeof SHARKSCOPE_NETWORKS)[number];
const ADVANCE_DELAY_MS = 220;

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
  const [step, setStep] = useState(1);

  // Identidade
  const [playerName, setPlayerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Quiz
  const [idade, setIdade] = useState<IdadeAnswer | null>(null);
  const [tempo, setTempo] = useState<TempoAnswer | null>(null);
  const [objetivo, setObjetivo] = useState<ObjetivoAnswer | null>(null);
  const [abi, setAbi] = useState<AbiAnswer | null>(null);
  const [volume, setVolume] = useState<VolumeAnswer | null>(null);
  const [banca, setBanca] = useState<BancaAnswer | null>(null);
  // notifyCadence deixou de ser perguntada — fica fixa em "ritmada" (default
  // da maioria). Quem quiser ajustar depois conversa com o coach.
  const notifyCadence = "ritmada" as const;
  const [whatsappOptIn, setWhatsappOptIn] = useState<boolean | null>(null);

  // Step 7 — SharkScope
  const [hasSharkscope, setHasSharkscope] = useState<boolean | null>(null);
  const [sharkscopeUsername, setSharkscopeUsername] = useState("");
  const [sharkscopeNetwork, setSharkscopeNetwork] = useState<SharkscopeNetwork>("PokerStars");

  const identityValid =
    playerName.trim().length >= 2 &&
    isValidEmail(email) &&
    isValidPhone(phone);

  const sharkscopeValid =
    hasSharkscope === false ||
    (hasSharkscope === true && sharkscopeUsername.trim().length >= 2);

  const finalSubmit = () => {
    if (!banca) return;
    if (whatsappOptIn === null) return; // exige consentimento explícito
    const completeQuiz: QuizAnswers = {
      idade: idade!,
      tempo: tempo!,
      objetivo: objetivo!,
      abi: abi!,
      volume: volume!,
      banca,
    };

    const leadScore = computeLeadScore(completeQuiz);
    const leadCategory = computeLeadCategory(leadScore);
    const stakeGrade = computeStakeGrade(completeQuiz);

    onSubmit({
      playerName: playerName.trim(),
      email: email.trim().toLowerCase(),
      phone,
      notifyChannels: ["email"],
      whatsappPhone: null,
      quizAnswers: completeQuiz,
      leadScore,
      leadCategory,
      stakeGrade,
      studyTime: defaultStudyTime(),
      profitGoal: objetivoToProfitGoal(objetivo!),
      volumeTargetWeekly: volumeToWeeklyTarget(volume!),
      notifyCadence,
      whatsappOptIn: whatsappOptIn!,
      sharkscopeUsername: hasSharkscope ? sharkscopeUsername.trim() : null,
      sharkscopeNetwork: hasSharkscope ? sharkscopeNetwork : null,
    });
  };

  /** Cria um onChange que seta o valor e avança pro próximo step
      (ou chama finalSubmit no último). */
  function autoAdvance<T extends string>(
    setter: Dispatch<SetStateAction<T | null>>,
    next: number | "submit"
  ) {
    return (value: T) => {
      setter(value);
      setTimeout(() => {
        if (next === "submit") finalSubmit();
        else setStep(next);
      }, ADVANCE_DELAY_MS);
    };
  }

  return (
    <div className="bg-starfield glow-amber-bottom relative min-h-screen overflow-hidden text-neutral-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/4 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-amber-400/8 blur-[140px]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 py-16">
        <Logo size="md" className="mb-6" />

        <ProgressBar current={step} total={TOTAL_STEPS} />

        <AnimatePresence mode="wait">
          {step === 1 && (
            <StepWrapper key="identidade">
              <Title>Preencha suas informações</Title>
              <Sub>Personalizamos sua experiência. Leva 2 minutos.</Sub>

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
              </div>

              <div className="mt-10 flex justify-end">
                <NextButton
                  disabled={!identityValid}
                  onClick={() => setStep(2)}
                  label="Continuar →"
                />
              </div>
            </StepWrapper>
          )}

          {step === 2 && (
            <StepWrapper key="idade">
              <Title>Qual é a sua idade?</Title>
              <QuestionOptions
                options={IDADE_OPTIONS}
                value={idade}
                onChange={autoAdvance(setIdade, 3)}
              />
              <BackBar onBack={() => setStep(1)} />
            </StepWrapper>
          )}

          {step === 3 && (
            <StepWrapper key="tempo">
              <Title>Há quanto tempo você joga poker?</Title>
              <QuestionOptions
                options={TEMPO_OPTIONS}
                value={tempo}
                onChange={autoAdvance(setTempo, 4)}
              />
              <BackBar onBack={() => setStep(2)} />
            </StepWrapper>
          )}

          {step === 4 && (
            <StepWrapper key="objetivo">
              <Title>Qual é o seu objetivo no poker?</Title>
              <QuestionOptions
                options={OBJETIVO_OPTIONS}
                value={objetivo}
                onChange={autoAdvance(setObjetivo, 5)}
              />
              <BackBar onBack={() => setStep(3)} />
            </StepWrapper>
          )}

          {step === 5 && (
            <StepWrapper key="abi">
              <Title>Qual é o seu ABI em dólares?</Title>
              <Sub>Buy-in médio nos últimos 6 meses (SharkScope).</Sub>
              <QuestionOptions
                options={ABI_OPTIONS}
                value={abi}
                onChange={autoAdvance(setAbi, 6)}
              />
              <BackBar onBack={() => setStep(4)} />
            </StepWrapper>
          )}

          {step === 6 && (
            <StepWrapper key="volume">
              <Title>Quantos torneios online você joga por mês?</Title>
              <Sub>
                Responda com uma média aproximada dos últimos 6 meses segundo
                o SharkScope.
              </Sub>
              <QuestionOptions
                options={VOLUME_OPTIONS}
                value={volume}
                onChange={autoAdvance(setVolume, 7)}
              />
              <BackBar onBack={() => setStep(5)} />
            </StepWrapper>
          )}

          {step === 7 && (
            <StepWrapper key="sharkscope-nick">
              <Title>Você joga em algum site que o SharkScope cobre?</Title>
              <Sub>
                Se você joga em PokerStars, GGPoker ou outros sites principais,
                informe seu nick aqui. Com isso o EV consegue puxar seus
                resultados automaticamente.
              </Sub>

              <div className="mt-8 space-y-2">
                {[
                  {
                    value: true,
                    label: "Sim, tenho conta SharkScope",
                    sub: "Vou informar meu nick agora.",
                  },
                  {
                    value: false,
                    label: "Não tenho conta SharkScope",
                    sub: "Quero pular esse passo por enquanto.",
                  },
                ].map((o) => {
                  const selected = hasSharkscope === o.value;
                  return (
                    <button
                      type="button"
                      key={String(o.value)}
                      onClick={() => setHasSharkscope(o.value)}
                      className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition ${
                        selected
                          ? "border-amber-400/70 bg-amber-400/15 text-amber-100"
                          : "border-neutral-800 bg-neutral-900/50 text-neutral-200 hover:border-neutral-700 hover:bg-neutral-900"
                      }`}
                    >
                      <span>
                        <span className="block font-semibold">{o.label}</span>
                        <span className="block text-xs text-neutral-400">{o.sub}</span>
                      </span>
                      <span
                        className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                          selected ? "border-amber-400 bg-amber-400" : "border-neutral-700"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>

              {hasSharkscope === true && (
                <div className="mt-6 space-y-4">
                  <Field label="Em qual site você joga mais?">
                    <select
                      value={sharkscopeNetwork}
                      onChange={(e) =>
                        setSharkscopeNetwork(e.target.value as SharkscopeNetwork)
                      }
                      className={inputClass}
                    >
                      {SHARKSCOPE_NETWORKS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Qual é o seu nick nesse site?">
                    <input
                      type="text"
                      value={sharkscopeUsername}
                      onChange={(e) => setSharkscopeUsername(e.target.value)}
                      placeholder="seu_nick_aqui"
                      className={inputClass}
                      autoFocus
                    />
                  </Field>
                  <p className="text-xs text-neutral-500">
                    ℹ️ Sem isso o EV não vai puxar seus resultados
                    automaticamente. Você ainda pode informar depois
                    conversando com o EV.
                  </p>
                </div>
              )}

              <div className="mt-8 flex justify-end">
                <NextButton
                  disabled={!sharkscopeValid}
                  onClick={() => setStep(8)}
                  label="Continuar →"
                />
              </div>
              <BackBar onBack={() => setStep(6)} />
            </StepWrapper>
          )}

          {step === 8 && (
            <StepWrapper key="banca">
              <Title>Qual é a sua banca total para poker online (em dólares)?</Title>
              <Sub>
                Não é só a soma do que você tem nas salas, é todo o dinheiro
                que você tem disponível para dar buy-ins, incluindo o que
                ainda pode depositar.
              </Sub>
              <QuestionOptions
                options={BANCA_OPTIONS}
                value={banca}
                onChange={autoAdvance(setBanca, 9)}
              />
              <BackBar onBack={() => setStep(7)} />
            </StepWrapper>
          )}

          {step === 9 && (
            <StepWrapper key="whatsapp-opt-in">
              <Title>
                Podemos te contatar pelo WhatsApp pra acompanhar sua execução
                na Comunidade?
              </Title>
              <Sub>
                A gente usa só pra te lembrar de tarefas, mandar review e
                avisar quando algo importante acontecer. Você pode mudar depois.
              </Sub>

              <div className="mt-8 space-y-2">
                {[
                  {
                    value: true,
                    label: "Aceito",
                    sub: "Quero receber lembretes e acompanhamento no WhatsApp.",
                  },
                  {
                    value: false,
                    label: "Não aceito",
                    sub: "Prefiro não receber mensagens no WhatsApp.",
                  },
                ].map((o) => {
                  const selected = whatsappOptIn === o.value;
                  return (
                    <button
                      type="button"
                      key={String(o.value)}
                      onClick={() => setWhatsappOptIn(o.value)}
                      className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition ${
                        selected
                          ? "border-amber-400/70 bg-amber-400/15 text-amber-100"
                          : "border-neutral-800 bg-neutral-900/50 text-neutral-200 hover:border-neutral-700 hover:bg-neutral-900"
                      }`}
                    >
                      <span>
                        <span className="block font-semibold">{o.label}</span>
                        <span className="block text-xs text-neutral-400">{o.sub}</span>
                      </span>
                      <span
                        className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                          selected ? "border-amber-400 bg-amber-400" : "border-neutral-700"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>

              <div className="mt-8 flex justify-end">
                <NextButton
                  disabled={whatsappOptIn === null}
                  onClick={() => finalSubmit()}
                  label="Concluir →"
                />
              </div>
              <BackBar onBack={() => setStep(8)} />
            </StepWrapper>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponentes
// ---------------------------------------------------------------------------

function StepWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.18 }}
      className="w-full"
    >
      {children}
    </motion.div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-display mt-8 text-center text-3xl leading-tight text-neutral-50 sm:text-4xl">
      {children}
    </h1>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 text-center text-sm text-neutral-400">{children}</p>
  );
}

function ProgressBar({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className="w-full max-w-xs">
      <div className="mb-1.5 flex items-center justify-between text-[11px] text-neutral-500">
        <span>
          Passo {current} de {total}
        </span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
        <motion.div
          className="h-full rounded-full bg-amber-400"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none transition focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function QuestionOptions<T extends string>({
  options,
  value,
  onChange,
}: {
  options: QuizOption<T>[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  const opts = useMemo(() => options, [options]);
  return (
    <div className="mt-8 space-y-2">
      {opts.map((o) => {
        const selected = value === o.value;
        return (
          <button
            type="button"
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition ${
              selected
                ? "border-amber-400/70 bg-amber-400/15 text-amber-100"
                : "border-neutral-800 bg-neutral-900/50 text-neutral-200 hover:border-neutral-700 hover:bg-neutral-900"
            }`}
          >
            <span>{o.label}</span>
            <span
              className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                selected ? "border-amber-400 bg-amber-400" : "border-neutral-700"
              }`}
            />
          </button>
        );
      })}
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
  const cleanLabel = label.replace(/→\s*$/, "").trim();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group inline-flex items-center gap-3 rounded-full px-5 py-2.5 text-sm font-bold uppercase tracking-wide transition ${
        disabled
          ? "cursor-not-allowed bg-neutral-800 text-neutral-500"
          : "bg-white text-neutral-900 shadow-lg shadow-amber-500/10 hover:bg-neutral-100"
      }`}
    >
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full ${
          disabled ? "bg-neutral-700" : "bg-amber-400"
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5 transition group-hover:translate-x-0.5"
        >
          <path d="M5 12h14" />
          <path d="M13 5l7 7-7 7" />
        </svg>
      </span>
      {cleanLabel}
    </button>
  );
}

function BackBar({ onBack }: { onBack: () => void }) {
  return (
    <div className="mt-8 flex justify-start">
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-neutral-500 transition hover:text-neutral-200"
      >
        ← Voltar
      </button>
    </div>
  );
}
