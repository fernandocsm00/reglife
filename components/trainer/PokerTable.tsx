"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { PlayerSeatComponent } from "./PlayerSeat";
import { Logo } from "@/components/Logo";
import type { CurrentDrill } from "@/lib/poker/types";

interface Props {
  drill: CurrentDrill;
  drillKey: string;
}

function getBoardCards(board: string): string[] {
  if (!board) return [];
  if (board.includes("-")) return board.split("-");
  const out: string[] = [];
  for (let i = 0; i < board.length; i += 2) out.push(board.slice(i, i + 2));
  return out;
}

export function PokerTable({ drill, drillKey }: Props) {
  const seats = drill.players.length;
  const heroFirst = drill.cardsOnHand.slice(0, 2);
  const heroSecond = drill.cardsOnHand.slice(2, 4);
  const boardCards = getBoardCards(drill.board);

  return (
    <div className="relative mx-auto h-[460px] w-[820px] max-w-full">
      {/* Oval table */}
      <div className="absolute inset-x-12 inset-y-10 rounded-full border border-neutral-700 bg-gradient-to-b from-neutral-900 to-neutral-950 shadow-[inset_0_0_60px_rgba(0,0,0,0.6)]" />

      {/* Logo central da mesa (watermark) */}
      <div className="pointer-events-none absolute left-1/2 top-[22%] -translate-x-1/2 opacity-90">
        <Logo size="lg" />
      </div>

      {/* Pot total */}
      <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 text-center">
        <div className="text-xs text-neutral-400">
          Pot total: {drill.potSize} BB
        </div>
      </div>

      {/* Board */}
      {boardCards.length > 0 && (
        <div className="absolute left-1/2 top-[48%] flex -translate-x-1/2 -translate-y-1/2 gap-1">
          {boardCards.map((c, i) => (
            <motion.div
              key={`${drillKey}-${i}-${c}`}
              initial={{ opacity: 0, y: -10, rotateY: 180 }}
              animate={{ opacity: 1, y: 0, rotateY: 0 }}
              transition={{ delay: 0.1 + i * 0.07, duration: 0.3 }}
            >
              <Image
                src={`/cards/${c}.svg`}
                alt={c}
                width={42}
                height={58}
                className="drop-shadow"
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* Current pot (street) */}
      <div className="absolute left-1/2 top-[62%] flex -translate-x-1/2 items-center gap-1">
        <Image src="/trainer/chips.svg" alt="chips" width={14} height={14} />
        <span className="text-xs text-neutral-300">{drill.currentPotSize} BB</span>
      </div>

      {/* Seats */}
      {drill.players.map((p) => (
        <PlayerSeatComponent
          key={p.position}
          player={p}
          totalSeats={seats}
          action={drill.action}
          heroFirstCard={heroFirst}
          heroSecondCard={heroSecond}
          drillKey={drillKey}
        />
      ))}
    </div>
  );
}
