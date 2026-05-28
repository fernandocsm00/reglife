"use client";

import { motion } from "motion/react";
import type { SavedPlan } from "@/lib/poker/planStorage";
import { buildResources } from "@/lib/poker/spotTrack";

interface Props {
  plan: SavedPlan;
}

export function ResourcesBlock({ plan }: Props) {
  const items = buildResources(plan);
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      style={{ marginTop: 40 }}
    >
      <p className="rg-eyebrow">Recursos pra sua jornada</p>
      <h3 className="rg-h3" style={{ marginTop: 6 }}>Apoio do plano</h3>
      <ul
        style={{
          margin: "12px 0 0",
          padding: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {items.map((item, i) => (
          <li key={i}>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rg-row"
              style={{ padding: "14px 18px" }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{item.label}</div>
                {item.sublabel && (
                  <div className="rg-caption" style={{ marginTop: 2 }}>
                    {item.sublabel}
                  </div>
                )}
              </div>
              <span className="rg-row__arrow">→</span>
            </a>
          </li>
        ))}
      </ul>
    </motion.section>
  );
}
