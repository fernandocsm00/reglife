// reg.life wordmark — uses /public/reglife-logo.svg so the artwork stays
// pixel-identical to the brand asset across all surfaces.

interface Props {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const HEIGHT: Record<NonNullable<Props["size"]>, number> = {
  sm: 20,
  md: 36,
  lg: 64,
  xl: 110,
};

export function Logo({ size = "md", className = "" }: Props) {
  const h = HEIGHT[size];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/reglife-logo.png"
      alt="reg.life"
      height={h}
      style={{ height: h, width: "auto" }}
      className={className}
    />
  );
}
