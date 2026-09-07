interface Props {
  ownedRegular: number;
  ownedComm: number;
  totalRegular: number;
  totalComm: number;
  size?: number;
}

/**
 * Donut SVG della collezione: divisionali possedute (verde),
 * commemorativi posseduti (ambra), mancanti (grigio).
 */
export default function CompletionDonut({
  ownedRegular,
  ownedComm,
  totalRegular,
  totalComm,
  size = 148,
}: Props) {
  const total = totalRegular + totalComm;
  const owned = ownedRegular + ownedComm;
  const missing = Math.max(0, total - owned);
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const fracRegular = total > 0 ? ownedRegular / total : 0;
  const fracComm = total > 0 ? ownedComm / total : 0;

  const segRegular = fracRegular * c;
  const segComm = fracComm * c;
  // Piccolo gap visivo tra gli spicchi (evita sovrapposizioni di stroke).
  const gap = owned > 0 && missing > 0 ? 2 : 0;
  const offComm = -(segRegular - gap);
  const offMissing = -(segRegular + segComm - gap * 2);

  return (
    <div className="flex items-center gap-5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeDasharray={`${Math.max(0, c + offMissing - gap)} ${c}`}
            strokeDashoffset={offMissing}
            className="stroke-zinc-200 dark:stroke-zinc-800"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeDasharray={`${Math.max(0, segRegular - gap)} ${c}`}
            className="stroke-emerald-500"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeDasharray={`${Math.max(0, segComm - gap)} ${c}`}
            strokeDashoffset={offComm}
            className="stroke-amber-400"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold tabular-nums text-zinc-900 dark:text-white">
            {owned}
          </span>
          <span className="text-xs text-zinc-500">di {total}</span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 text-xs">
        <p className="font-semibold text-zinc-900 dark:text-zinc-100">
          Ripartizione collezione
        </p>
        <LegendDot
          className="bg-emerald-500"
          label={`Divisionali ${ownedRegular}/${totalRegular}`}
        />
        <LegendDot
          className="bg-amber-400"
          label={`Commemorativi ${ownedComm}/${totalComm}`}
        />
        <LegendDot
          className="bg-zinc-300 dark:bg-zinc-700"
          label={`Mancanti ${missing}`}
        />
      </div>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
      <span className={`h-2.5 w-2.5 rounded-full ${className}`} />
      <span className="tabular-nums">{label}</span>
    </span>
  );
}
