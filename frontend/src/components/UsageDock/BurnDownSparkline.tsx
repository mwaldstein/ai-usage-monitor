interface BurnDownSparklineProps {
  values: number[];
  color: string;
  width?: number;
  height?: number;
  isBurnDown?: boolean;
}

export function BurnDownSparkline({
  values,
  color,
  width = 60,
  height = 24,
  isBurnDown = false,
}: BurnDownSparklineProps) {
  if (!values.length) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  if (range < 0.01) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[10px] text-zinc-600 font-mono">—</span>
        <span className="text-[8px] text-zinc-700">no change</span>
      </div>
    );
  }

  const plotWidth = width - 3;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1 || 1)) * plotWidth;
      const normalizedY = (v - min) / range;
      const y = 2 + (1 - normalizedY) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const startValue = values[0];
  const endValue = values[values.length - 1];
  const isDepleting = endValue < startValue;
  const isReplenishing = endValue > startValue;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width={width} height={height} className="opacity-90">
        <defs>
          <linearGradient
            id={`dock-gradient-${color.replace("#", "")}`}
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
          y1={height - 2}
          x2={width}
          y2={height - 2}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
          strokeDasharray="2,2"
        />

        <polygon
          points={`0,${height - 2} ${points} ${width},${height - 2}`}
          fill={`url(#dock-gradient-${color.replace("#", "")})`}
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
          cx={width - 3}
          cy={2 + (1 - (endValue - min) / range) * (height - 4)}
          r="2.5"
          fill={color}
        />
      </svg>

      {isBurnDown && (
        <span
          className={`text-[8px] font-medium ${
            isDepleting ? "text-red-400" : isReplenishing ? "text-emerald-400" : "text-zinc-500"
          }`}
        >
          {isDepleting ? "↓ burning" : isReplenishing ? "↑ refilling" : "→ steady"}
        </span>
      )}
    </div>
  );
}
