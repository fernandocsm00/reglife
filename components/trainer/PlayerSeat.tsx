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
  drillKey: string; // changes per drill, used to retrigger entrance animations
}

// Position each seat around an ellipse. Hero (index 1) sits at the bottom-center.
function seatStyle(index: number, totalSeats: number): React.CSSProperties {
  const startAngle = Math.PI / 2; // bottom of the ellipse
  const angle = startAngle + ((index - 1) / totalSeats) * Math.PI * 2;
  const rx = 42;
  const ry = 38;
  const x = 50 + rx * Math.cos(angle);
  const y = 50 + ry * Math.sin(angle);
  return {
    left: `${x}%`,
    top: `${y}%`,
    transform: "translate(-50%, -50%)",
  };
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

  const isPostflopHighlight =
    player.hasCards &&
    (action === "cBet" || action === "vsOpen" || action === "vs3Bet");

  const borderClass = player.isHero
    ? "border-2 border-amber-400"
    : !player.hasCards && !player.isVillain
    ? "border border-neutral-700 bg-neutral-800"
    : isPostflopHighlight
    ? "border-2 border-amber-900"
    : "border border-neutral-700";

  return (
    <div
      className="absolute flex flex-col items-center gap-1"
      style={seatStyle(player.index, totalSeats)}
    >
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
      <div className="text-[10px] text-neutral-500">$1000</div>

      {player.position === "BTN" && (
        <Image
          src="/trainer/dealerButton.svg"
          alt="dealer button"
          width={16}
          height={16}
          className="absolute -top-2 -right-3"
        />
      )}

      {player.hasChipsInFront && (
        <motion.div
          key={`${drillKey}-${player.position}-chips`}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.2 }}
          className="absolute -top-9 flex items-center gap-1 whitespace-nowrap"
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
