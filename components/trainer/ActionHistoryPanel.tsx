"use client";

import type { ActionHistoryStreet } from "@/lib/poker/types";

interface Props {
  history: ActionHistoryStreet[];
}

export function ActionHistoryPanel({ history }: Props) {
  if (!history || history.length === 0) return null;
  return (
    <div className="flex flex-col gap-3 text-xs">
      {history.map((street) => (
        <div key={street.street}>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-neutral-500">
            {street.street}
          </div>
          <div className="flex flex-col gap-0.5">
            {street.actions.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-10 text-neutral-400">{a.position}</span>
                <span className="font-semibold text-neutral-200">{a.action}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
