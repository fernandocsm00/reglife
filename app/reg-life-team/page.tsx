// app/reg-life-team/page.tsx
//
// Tela exibida quando o aluno passa em TODOS os spots do nivelamento
// (≥70% em cada um, sem early stop). DiagnosticoScreen detecta esse caso
// no fim do teste e roteia direto pra cá em vez do plano padrão.
//
// CTA: aplicação pro Reg Life Team (link externo).

import Link from "next/link";
import { Logo } from "@/components/Logo";

const TEAM_APPLICATION_URL = "https://social.reglife.com.br/tm-desafio-profissao-poker";

export default function RegLifeTeamPage() {
  return (
    <div className="bg-starfield glow-amber-bottom relative min-h-screen overflow-hidden text-neutral-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400/10 blur-[140px]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
        <Logo size="md" className="mb-12" />

        <h1 className="font-display text-4xl leading-[1.1] text-neutral-50 sm:text-5xl">
          WOW, FUTURO NERDGUY DETECTADO!
        </h1>

        <p className="mt-6 text-2xl font-bold text-amber-300 sm:text-3xl">
          TÁ JOGANDO O FINO!
        </p>

        <div className="mt-10 space-y-5 text-base leading-relaxed text-neutral-200 sm:text-lg">
          <p className="font-semibold text-neutral-50">
            Você já tem nível técnico para bater os mid stakes (no mínimo).
          </p>

          <p>
            Isso significa que o Desafio Profissão Poker não atende o seu caso.
          </p>

          <p className="font-semibold text-neutral-50">
            Para um jogador do seu nível, o lugar certo é o Reg Life Team!
          </p>

          <p>Tem interesse em jogar para o nosso time?</p>

          <p className="text-sm text-neutral-400">
            Clique abaixo e preencha sua aplicação:
          </p>
        </div>

        <a
          href={TEAM_APPLICATION_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-10 inline-flex items-center justify-center rounded-full bg-amber-300 px-8 py-4 text-base font-black uppercase tracking-wide text-neutral-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-200 sm:text-lg"
        >
          Quero entrar no Reg Life Team
        </a>

        <Link
          href="/"
          className="mt-12 text-xs text-neutral-500 transition hover:text-neutral-300"
        >
          ← Voltar pra home
        </Link>
      </div>
    </div>
  );
}
