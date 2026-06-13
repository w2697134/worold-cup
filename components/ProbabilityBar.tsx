export function ProbabilityBar({
  homeWin,
  draw,
  awayWin,
}: {
  homeWin: number;
  draw: number;
  awayWin: number;
}) {
  return (
    <div>
      <div className="flex h-3.5 w-full overflow-hidden rounded-full ring-1 ring-white/10">
        <div
          className="h-full origin-left animate-grow-x bg-gradient-to-r from-emerald-400 to-emerald-500"
          style={{ width: `${homeWin}%` }}
        />
        <div
          className="h-full origin-left animate-grow-x bg-white/25"
          style={{ width: `${draw}%` }}
        />
        <div
          className="h-full origin-left animate-grow-x bg-gradient-to-r from-rose-500 to-orange-500"
          style={{ width: `${awayWin}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] font-medium">
        <span className="text-emerald-400">主胜 {homeWin}%</span>
        <span className="text-white/55">平局 {draw}%</span>
        <span className="text-rose-400">客胜 {awayWin}%</span>
      </div>
    </div>
  );
}
