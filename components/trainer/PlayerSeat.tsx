"use client";

import Image from "next/image";
import clsx from "clsx";
import { motion } from "motion/react";
import type { PlayerSeat as PlayerSeatModel, PokerAction } from "@/lib/poker/types";

interface Props {
  player: PlayerSeatModel;
  totalSeats: number;
  action: PokerAction;
  heroFirstCard: string;
  heroSecondCard: string;
  drillKey: string;
}

// ---------------------------------------------------------------------------
// Fixed seat positions (% of the table container).
// Seat 1 = hero (bottom center), then clockwise: bottom-right → right →
// top-right → top-center → top-left → left → bottom-left.
// ---------------------------------------------------------------------------
const SEAT_COORDS_8: [number, number][] = [
  [50, 92],  // seat 1 – hero – bottom center
  [75, 82],  // seat 2 – bottom right
  [92, 48],  // seat 3 – right
  [75, 14],  // seat 4 – top right
  [50, 6],   // seat 5 – top center
  [25, 14],  // seat 6 – top left
  [8, 48],   // seat 7 – left
  [25, 82],  // seat 8 – bottom left
];

// Direction from seat toward the center of the table, used to offset chips
const CHIP_OFFSETS_8: [number, number][] = [
  [0, -42],    // hero: chips above
  [-16, -38],  // bottom-right: up-left
  [-40, 0],    // right: left
  [-16, 38],   // top-right: down-left
  [0, 38],     // top center: below
  [16, 38],    // top-left: down-right
  [40, 0],     // left: right
  [16, -38],   // bottom-left: up-right
];

function seatStyle(index: number, totalSeats: number): React.CSSProperties {
  // For 8 seats, use fixed coords. Fallback to ellipse for other table sizes.
  if (totalSeats === 8 && index >= 1 && index <= 8) {
    const [x, y] = SEAT_COORDS_8[index - 1];
    return { left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" };
  }
  // Fallback: elliptical layout, clockwise from bottom
  const startAngle = Math.PI / 2;
  const angle = startAngle - ((index - 1) / totalSeats) * Math.PI * 2;
  const rx = 42;
  const ry = 40;
  const x = 50 + rx * Math.cos(angle);
  const y = 50 - ry * Math.sin(angle);
  return { left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" };
}

function chipOffset(index: number, totalSeats: number): React.CSSProperties {
  if (totalSeats === 8 && index >= 1 && index <= 8) {
    const [dx, dy] = CHIP_OFFSETS_8[index - 1];
    return {
      position: "absolute" as const,
      left: "50%",
      top: "50%",
      transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`,
    };
  }
  // Fallback: directly above
  return { position: "absolute" as const, top: "-36px", left: "50%", transform: "translateX(-50%)" };
}

export function PlayerSeatComponent({
  player,
  totalSeats,
  action,
  heroFirstCard,
  heroSecondCard,
  drillKey,
}: Props) {
  const showCards = player.hasCards || player.isHero || player.isVillain;

  const borderClass = player.isHero
    ? "border-2 border-amber-400"
    : player.hasCards || player.isVillain
    ? "border border-amber-900"
    : "border border-neutral-700 bg-neutral-800/60";

  return (
    <div
      className="absolute flex flex-col items-center gap-1"
      style={seatStyle(player.index, totalSeats)}
    >
      {/* Cards */}
      {showCards && (
        <motion.div
          key={`${drillKey}-${player.position}`}
          initial={{ opacity: 0, y: -8, rotateY: 180 }}
          animate={{ opacity: 1, y: 0, rotateY: 0 }}
          transition={{ duration: 0.35, delay: player.isHero ? 0.05 : 0 }}
          className="flex -space-x-3"
        >
          {player.isHero ? (
            <>
              <Image
                src={`/cards/${heroFirstCard}.svg`}
                alt={heroFirstCard}
                width={36}
                height={50}
                className="drop-shadow"
              />
              <Image
                src={`/cards/${heroSecondCard}.svg`}
                alt={heroSecondCard}
                width={36}
                height={50}
                className="drop-shadow"
              />
            </>
          ) : (
            <>
              <Image src="/trainer/verso.svg" alt="card back" width={32} height={46} />
              <Image src="/trainer/verso.svg" alt="card back" width={32} height={46} />
            </>
          )}
        </motion.div>
      )}

      {/* Position label + stack */}
      <div
        className={clsx(
          "flex items-center gap-2 rounded-md px-2 py-1 text-xs font-semibold",
          borderClass
        )}
      >
        <span className="text-neutral-200">{player.position}</span>
        <span className="rounded bg-neutral-900 px-1.5 py-0.5 text-neutral-300">
          {player.stackSize}
        </span>
      </div>

      {/* Dealer button */}
      {player.position === "BTN" && (
        <div className="mt-0.5">
          <Image
            src="/trainer/dealerButton.svg"
            alt="D"
            width={18}
            height={18}
          />
        </div>
      )}

      {/* Chips in front (bet) — positioned toward center */}
      {player.hasChipsInFront && (
        <motion.div
          key={`${drillKey}-${player.position}-chips`}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.2 }}
          className="flex items-center gap-1 whitespace-nowrap"
          style={chipOffset(player.index, totalSeats)}
        >
          <Image src="/trainer/chips.svg" alt="chips" width={14} height={14} />
          <span className="text-xs font-semibold text-neutral-200">
            {player.amountOfChips} BB
          </span>
        </motion.div>
      )}
    </div>
  );
}
