"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Logo } from "@/components/Logo";
import type { ProfitGoal, StudyTime } from "@/lib/poker/planStorage";

export type SharkscopeNetwork =
  | "PokerStars"
  | "GGPoker"
  | "PartyPoker"
  | "888Poker"
  | "WPN"
  | "iPoker";

export interface OnboardingData {
  playerName: string;
  email: string;
  phone: string;
  studyTime: StudyTime;
  profitGoal: ProfitGoal;
  sharkscopeUsername: string; // pode vir vazio (opcional)
  sharkscopeNetwork: SharkscopeNetwork;
  /** Meta semanal de torneios (usada pelo EV pra cobrar volume). */
  volumeTargetWeekly: number;
  /** Canais escolhidos pra receber o relatório do plano. */
  notifyChannels: string[];
  /** WhatsApp confirmado pelo usuário (quando marcar o canal). */
  whatsappPhone: string | null;
}

const NETWORK_OPTIONS: SharkscopeNetwork[] = [
  "PokerStars",
  "GGPoker",
  "PartyPoker",
  "888Poker",
  "WPN",
  "iPoker",
];

const VOLUME_OPTIONS: { value: number; label: string }[] = [
  { value: 50, label: "Até 50/sem" },
  { value: 100, label: "50-100/sem" },
  { value: 200, label: "100-200/sem" },
  { value: 300, label: "200+/sem" },
];

interface Props {
  onSubmit: (data: OnboardingData) => void;
}

const STUDY_OPTIONS: { id: StudyTime; label: string }[] = [
  { id: "ate15", label: "Até 15h semanais" },
  { id: "ate40", label: "Até 40h semanais" },
  { id: "mais40", label: "Mais de 40h semanais" },
];

const PROFIT_OPTIONS: { id: ProfitGoal; label: string }[] = [
  { id: "usd1k", label: "U$ 1.000" },
  { id: "usd10k", label: "U$ 10.000" },
  { id: "usd50k", label: "U$ 50.000" },
  { id: "usd100k", label: "U$ 100.000" },
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
  const [profitGoal, setProfitGoal] = useState<ProfitGoal>("usd1k");
  const [sharkscopeUsername, setSharkscopeUsername] = useState("");
  const [sharkscopeNetwork, setSharkscopeNetwork] =
    useState<SharkscopeNetwork>("PokerStars");
  const [volumeTargetWeekly, setVolumeTargetWeekly] = useState(100);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState("");

  const canSubmit =
    playerName.trim().length >= 2 &&
    isValidEmail(email) &&
    isValidPhone(phone) &&
    (notifyEmail || notifyWhatsapp) &&
    (!notifyWhatsapp || whatsappPhone.trim().length > 0);

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
          estudo e onde você quer chegar.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            if (!notifyEmail && !notifyWhatsapp) {
              alert("Escolhe pelo menos um canal pra receber o relatório.");
              return;
            }
            if (notifyEmail && !email.trim()) {
              alert("Email obrigatório pra receber o relatório.");
              return;
            }
            if (notifyWhatsapp && !whatsappPhone.trim()) {
              alert("Confirme o número de WhatsApp.");
              return;
            }
            const notifyChannels: string[] = [];
            if (notifyEmail) notifyChannels.push("email");
            if (notifyWhatsapp) notifyChannels.push("whatsapp");
            onSubmit({
              playerName: playerName.trim(),
              email: email.trim().toLowerCase(),
              phone,
              studyTime,
              profitGoal,
              sharkscopeUsername: sharkscopeUsername.trim(),
              sharkscopeNetwork,
              volumeTargetWeekly,
              notifyChannels,
              whatsappPhone: notifyWhatsapp ? whatsappPhone.trim() : null,
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
              required
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

          <fieldset className="rounded-md border border-neutral-800 p-3 mt-3">
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
                  if (e.target.checked && !whatsappPhone) setWhatsappPhone(phone);
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
            <p className="mt-2 text-xs text-neutral-500">
              EV também usa esses canais pra te lembrar de check-ins. Você pode mudar depois em Configurações.
            </p>
          </fieldset>

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

          <Field label="Quanto de profit você quer nos próximos 12 meses?">
            <div className="grid grid-cols-2 gap-2">
              {PROFIT_OPTIONS.map((opt) => (
                <OptionButton
                  key={opt.id}
                  selected={profitGoal === opt.id}
                  onClick={() => setProfitGoal(opt.id)}
                  label={opt.label}
                />
              ))}
            </div>
          </Field>

          <Field label="Meta de volume — torneios por semana">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {VOLUME_OPTIONS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  selected={volumeTargetWeekly === opt.value}
                  onClick={() => setVolumeTargetWeekly(opt.value)}
                  label={opt.label}
                />
              ))}
            </div>
          </Field>

          <Field label="Seu nick no site (opcional — para o EV acompanhar seu ROI)">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
              <input
                type="text"
                value={sharkscopeUsername}
                onChange={(e) => setSharkscopeUsername(e.target.value)}
                placeholder="Ex: hero123"
                className={inputClass}
                autoComplete="off"
              />
              <select
                value={sharkscopeNetwork}
                onChange={(e) =>
                  setSharkscopeNetwork(e.target.value as SharkscopeNetwork)
                }
                className={`${inputClass} sm:w-44`}
              >
                {NETWORK_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-2 text-[11px] text-neutral-500">
              Não pedimos senha. Só usamos seu nick público pra puxar ROI/ITM
              via SharkScope.
            </p>
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
