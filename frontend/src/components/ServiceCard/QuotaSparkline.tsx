interface QuotaSparklineProps {
  values: number[];
  color: string;
  isBurnDown?: boolean;
}

export function QuotaSparkline({ values, color, isBurnDown = false }: QuotaSparklineProps) {
  if (!values.length) return null;

  const width = 120;
  const height = 36;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  if (range < 0.01) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ width, height }}>
        <span className="text-xs text-zinc-600 font-mono">—</span>
        <span className="text-[10px] text-zinc-700">no change</span>
      </div>
    );
  }

  const plotWidth = width - 4;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1 || 1)) * plotWidth;
      const normalizedY = (v - min) / range;
      const y = 3 + (1 - normalizedY) * (height - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const endValue = values[values.length - 1];
  const startValue = values[0];
  const isDepleting = endValue < startValue;
  const isReplenishing = endValue > startValue;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={width} height={height} className="opacity-90">
        <defs>
          <linearGradient
            id={`quota-gradient-${color.replace("#", "")}`}
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0.05" />
          </linearGradient>
        </defs>

        <line
          x1="0"
          y1={height - 3}
          x2={width}
          y2={height - 3}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
          strokeDasharray="2,2"
        />

        <polygon
          points={`0,${height - 3} ${points} ${width},${height - 3}`}
          fill={`url(#quota-gradient-${color.replace("#", "")})`}
        />

        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <circle
          cx={width - 4}
          cy={3 + (1 - (endValue - min) / range) * (height - 6)}
          r="3"
          fill={color}
        />
      </svg>

      {isBurnDown && (
        <span
          className={`text-[10px] font-medium ${
            isDepleting ? "text-red-400" : isReplenishing ? "text-emerald-400" : "text-zinc-500"
          }`}
        >
          {isDepleting ? "↓ burning" : isReplenishing ? "↑ refilling" : "→ steady"}
        </span>
      )}
    </div>
  );
}
