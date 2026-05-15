// reg.life mark — diamante âmbar (símbolo standalone, sem wordmark).
// Asset em /public/reglife-diamond.svg.

import Link from "next/link";

interface Props {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  /**
   * Para onde o logo navega ao clicar.
   * - default: "/" (Logo vira atalho universal pra home)
   * - null: desabilita o link (use na própria home pra não auto-linkar)
   */
  href?: string | null;
}

const SIZE: Record<NonNullable<Props["size"]>, number> = {
  sm: 20,
  md: 36,
  lg: 64,
  xl: 110,
};

export function Logo({ size = "md", className = "", href = "/" }: Props) {
  const s = SIZE[size];
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/reglife-diamond.svg"
      alt="reg.life"
      width={s}
      height={s}
      style={{ width: s, height: s }}
      className={className}
    />
  );

  if (!href) return img;
  return (
    <Link
      href={href}
      aria-label="Voltar para a home"
      className="inline-block transition hover:opacity-80"
    >
      {img}
    </Link>
  );
}
