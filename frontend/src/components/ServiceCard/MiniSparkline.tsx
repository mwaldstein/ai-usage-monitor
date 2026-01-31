interface MiniSparklineProps {
  values: number[];
  color: string;
}

export function MiniSparkline({ values, color }: MiniSparklineProps) {
  if (!values.length) return null;

  const filteredValues = values.filter((v) => Number.isFinite(v));
  if (!filteredValues.length) return null;

  const min = Math.min(...filteredValues);
  const max = Math.max(...filteredValues);
  const range = max - min;

  if (range < 0.01) {
    return <span className="text-[10px] text-zinc-600 font-mono px-1">—</span>;
  }

  const points = filteredValues
    .map((v, i) => {
      const x = (i / (filteredValues.length - 1 || 1)) * 56;
      const normalizedY = (v - min) / range;
      const y = 2 + (1 - normalizedY) * 16;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width="56" height="20" className="opacity-70">
      <defs>
        <linearGradient
          id={`spark-fill-${color.replace("#", "")}`}
          x1="0%"
          y1="0%"
          x2="0%"
          y2="100%"
        >
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      <polygon
        points={`0,18 ${points} 56,18`}
        fill={`url(#spark-fill-${color.replace("#", "")})`}
      />

      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
