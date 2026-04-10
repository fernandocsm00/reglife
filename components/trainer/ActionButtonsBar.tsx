"use client";

import clsx from "clsx";
import { motion, AnimatePresence } from "motion/react";
import type { ActionButtonState } from "@/lib/poker/types";
import { sounds } from "@/lib/audio/sounds";

interface Props {
  buttons: ActionButtonState[];
  hasPicked: boolean;
  onPick: (text: string) => void;
}

export function ActionButtonsBar({ buttons, hasPicked, onPick }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3 w-full max-w-2xl mx-auto">
      <AnimatePresence mode="popLayout" initial={false}>
        {buttons.map((button) => {
          if (!hasPicked) {
            return (
              <motion.button
                key={button.text}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
                onClick={() => {
                  sounds.click();
                  onPick(button.text);
                }}
                className="rounded-md py-3 text-sm font-bold text-white shadow"
                style={{ background: button.color }}
              >
                {button.text}
              </motion.button>
            );
          }
          // Feedback state
          const isPicked = button.pickedByUser;
          const isCorrect = button.isCorrect;
          return (
            <motion.div
              key={button.text}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              className={clsx(
                "flex items-center justify-center gap-2 rounded-md py-3 text-sm font-bold ring-1",
                isPicked && isCorrect && "bg-emerald-600/30 text-emerald-300 ring-emerald-400",
                isPicked && !isCorrect && "bg-red-600/30 text-red-300 ring-red-400",
                !isPicked && isCorrect && "bg-emerald-600/10 text-emerald-300/70 ring-emerald-700",
                !isPicked && !isCorrect && "bg-neutral-800/40 text-neutral-500 ring-neutral-700"
              )}
            >
              {isCorrect ? "✓" : "✗"} {button.text}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
