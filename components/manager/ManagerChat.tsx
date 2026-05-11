"use client";

/**
 * ManagerChat — Interface de chat com o REX
 *
 * Features:
 * - Streaming de resposta (SSE)
 * - Histórico de mensagens
 * - Indicador de streak + XP
 * - Sugestões rápidas de resposta
 * - Avatar do REX com animação de "digitando"
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { SavedPlan } from "@/lib/poker/planStorage";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface Message {
  id: string;
  role: "manager" | "player";
  content: string;
  createdAt: string;
}

interface ManagerChatProps {
  userId: string;
  playerName: string;
  currentStreak: number;
  weeklyXp: number;
  totalXp: number;
  cycleDay: number;
  currentPhase: string;
  /** Necessário no modo sem-auth: o backend usa pra montar contexto. */
  plan?: SavedPlan | null;
}

// ---------------------------------------------------------------------------
// Sugestões rápidas (contextual — podem ser expandidas depois)
// ---------------------------------------------------------------------------
const QUICK_REPLIES = [
  "Estudei ontem, pode cobrar",
  "Não consegui estudar essa semana",
  "Como tá meu ROI geral?",
  "Qual é a próxima aula?",
  "Quero refazer o nivelamento",
];

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function ManagerChat({
  userId,
  playerName,
  currentStreak,
  weeklyXp,
  totalXp,
  cycleDay,
  currentPhase,
  plan,
}: ManagerChatProps) {
  const isDiagMode = userId.startsWith("diag:");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [streamingText, setStreamingText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ---- Carrega histórico inicial ----------------------------------------
  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch(`/api/manager/chat?userId=${userId}`);
        const data = await res.json();
        if (data.messages) {
          setMessages(
            data.messages.map((m: any) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              createdAt: m.created_at,
            }))
          );
        }
      } catch (err) {
        console.error("Erro ao carregar histórico:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadHistory();

    // Diag mode: marca todas as notificações Rex como lidas — o aluno
    // está vendo elas aqui no chat agora, não tem sentido manter unread.
    if (isDiagMode) {
      fetch("/api/profile/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      }).catch(() => {});
    }
  }, [userId, isDiagMode]);

  // ---- Auto-scroll --------------------------------------------------------
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText, isTyping]);

  // ---- Enviar mensagem ----------------------------------------------------
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isTyping) return;

      // Adiciona mensagem do aluno imediatamente
      const playerMsg: Message = {
        id: `player-${Date.now()}`,
        role: "player",
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, playerMsg]);
      setInput("");
      setIsTyping(true);
      setStreamingText("");

      try {
        // No modo sem-auth, o backend não persiste histórico — mandamos
        // as últimas trocas + o plano do localStorage pra montar contexto.
        const recentMessages = isDiagMode
          ? messages.slice(-6).map((m) => ({
              role: m.role,
              content: m.content,
              createdAt: m.createdAt,
            }))
          : undefined;

        const res = await fetch("/api/manager/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            message: trimmed,
            ...(isDiagMode ? { plan, recentMessages } : {}),
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error("Erro na requisição");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6);
            if (payload === "[DONE]") break;
            try {
              const parsed = JSON.parse(payload);
              if (parsed.text) {
                accumulated += parsed.text;
                setStreamingText(accumulated);
              }
            } catch {
              // ignora linhas malformadas
            }
          }
        }

        // Adiciona mensagem final do REX
        const rexMsg: Message = {
          id: `rex-${Date.now()}`,
          role: "manager",
          content: accumulated,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, rexMsg]);
        setStreamingText("");
      } catch (err) {
        console.error("Erro ao enviar:", err);
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: "manager",
            content: "Tive um problema técnico. Tente de novo em alguns segundos.",
            createdAt: new Date().toISOString(),
          },
        ]);
      } finally {
        setIsTyping(false);
        inputRef.current?.focus();
      }
    },
    [userId, isTyping, isDiagMode, messages, plan]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // ---- Render -------------------------------------------------------------
  return (
    <div className="flex h-full flex-col">
      {/* Header com métricas */}
      <div className="border-b border-neutral-800 bg-neutral-950/80 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Avatar REX */}
            <div className="relative">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-neutral-950">
                R
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-green-400" />
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-100">REX</p>
              <p className="text-xs text-neutral-500">Manager RegLife · online</p>
            </div>
          </div>

          {/* Streak + XP */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-base">🔥</span>
              <span className="font-bold text-amber-300">{currentStreak}</span>
              <span className="text-neutral-500">dias</span>
            </div>
            <div className="hidden sm:flex items-center gap-1">
              <span className="font-bold text-amber-300">{weeklyXp}</span>
              <span className="text-neutral-500">XP semana</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-neutral-500">Dia</span>
              <span className="font-bold text-amber-300">{cycleDay}</span>
              <span className="text-neutral-500">/90</span>
            </div>
          </div>
        </div>
      </div>

      {/* Área de mensagens */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-300 border-t-transparent" />
            </div>
          ) : messages.length === 0 ? (
            <EmptyState playerName={playerName} />
          ) : null}

          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </AnimatePresence>

          {/* Streaming em progresso */}
          {streamingText && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3"
            >
              <RexAvatar />
              <div className="max-w-[80%] rounded-2xl rounded-tl-none bg-neutral-800 px-4 py-3 text-sm text-neutral-100">
                <p className="whitespace-pre-wrap">{streamingText}</p>
                <span className="ml-1 inline-block h-3 w-0.5 animate-pulse bg-amber-300 align-middle" />
              </div>
            </motion.div>
          )}

          {/* Typing indicator */}
          {isTyping && !streamingText && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3"
            >
              <RexAvatar />
              <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-none bg-neutral-800 px-4 py-3">
                {[0, 0.15, 0.3].map((delay, i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400"
                    style={{ animationDelay: `${delay}s` }}
                  />
                ))}
              </div>
            </motion.div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Quick replies */}
      {messages.length > 0 && !isTyping && (
        <div className="border-t border-neutral-800/50 px-4 py-2">
          <div className="mx-auto flex max-w-2xl gap-2 overflow-x-auto pb-1">
            {QUICK_REPLIES.map((reply) => (
              <button
                key={reply}
                onClick={() => sendMessage(reply)}
                className="shrink-0 rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-300 transition hover:border-amber-400/50 hover:text-amber-300"
              >
                {reply}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-neutral-800 bg-neutral-950/80 px-4 py-3 backdrop-blur">
        <form onSubmit={handleSubmit} className="mx-auto flex max-w-2xl gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Manda mensagem pro REX..."
            rows={1}
            disabled={isTyping}
            className="flex-1 resize-none rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:border-amber-400/50 focus:outline-none disabled:opacity-50"
            style={{ minHeight: "42px", maxHeight: "120px" }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-amber-300 text-neutral-950 transition hover:bg-amber-200 disabled:opacity-40"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9L22 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </form>
        <p className="mx-auto mt-1.5 max-w-2xl text-center text-[10px] text-neutral-600">
          Enter para enviar · Shift+Enter para nova linha
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: Message }) {
  const isRex = message.role === "manager";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-3 ${isRex ? "" : "flex-row-reverse"}`}
    >
      {isRex ? <RexAvatar /> : null}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
          isRex
            ? "rounded-tl-none bg-neutral-800 text-neutral-100"
            : "rounded-tr-none bg-amber-300 text-neutral-950"
        }`}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        <p
          className={`mt-1 text-[10px] ${
            isRex ? "text-neutral-500" : "text-neutral-700"
          }`}
        >
          {formatTime(message.createdAt)}
        </p>
      </div>
    </motion.div>
  );
}

function RexAvatar() {
  return (
    <div className="mt-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-neutral-950">
      R
    </div>
  );
}

function EmptyState({ playerName }: { playerName: string }) {
  return (
    <div className="py-16 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-400/10 text-2xl">
        ♠️
      </div>
      <p className="text-sm font-medium text-neutral-300">
        Oi, {playerName}. Sou o REX.
      </p>
      <p className="mt-1 text-xs text-neutral-500">
        Manda uma mensagem pra começar.
      </p>
    </div>
  );
}

function formatTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
