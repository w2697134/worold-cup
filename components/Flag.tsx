/* eslint-disable @next/next/no-img-element */

export function Flag({
  code,
  size = 40,
  className = "",
}: {
  code: string;
  size?: number;
  className?: string;
}) {
  const height = Math.round(size * 0.66);
  const placeholder = code === "tbd" || code.startsWith("slot-");

  if (placeholder) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-[3px] bg-white/10 text-[10px] font-bold text-white/45 ring-1 ring-white/10 ${className}`}
        style={{ width: size, height }}
        aria-hidden="true"
      >
        待
      </span>
    );
  }

  return (
    <img
      src={`https://flagcdn.com/w80/${code}.png`}
      alt={`${code} flag`}
      width={size}
      height={height}
      loading="lazy"
      className={`rounded-[3px] object-cover shadow-md ring-1 ring-white/10 ${className}`}
      style={{ width: size, height }}
    />
  );
}
