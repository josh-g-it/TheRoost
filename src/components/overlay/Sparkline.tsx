interface SparklineProps {
  data: number[];
  /** Internal coordinate width for the SVG viewBox. */
  width?: number;
  /** Height in pixels. */
  height?: number;
  /** Fixed Y-axis ceiling. When omitted, auto-scales to data with 20% headroom. */
  max?: number;
  color?: string;
  className?: string;
}

export function Sparkline({
  data,
  width = 200,
  height = 30,
  max,
  color = "var(--color-accent-primary)",
  className,
}: SparklineProps) {
  if (data.length < 2) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
        className={className}
        style={{ display: "block" }}
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--color-text-tertiary)"
          strokeWidth={1}
          strokeDasharray="4 4"
          opacity={0.3}
        />
      </svg>
    );
  }

  // Auto-scale: use data peak + 20% headroom so spikes/dips are prominent
  const effectiveMax = max ?? Math.max(...data, 1) * 1.2;
  const padding = 2;
  const usableHeight = height - padding * 2;

  const points = data.map((value, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = padding + usableHeight - (value / effectiveMax) * usableHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = `M ${points.join(" L ")}`;
  const areaD = `${pathD} L ${width},${height} L 0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      className={className}
      style={{ display: "block" }}
    >
      <path d={areaD} fill={color} opacity={0.1} />
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
