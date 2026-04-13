export function Sparkline({
  values,
  width = 80,
  height = 20,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length === 0) {
    return <div className="h-5 w-20 text-[10px] text-muted-foreground/70">—</div>;
  }
  const max = Math.max(...values, 1);
  const step = width / Math.max(values.length - 1, 1);
  const points = values
    .map((v, i) => `${i * step},${height - (v / max) * height}`)
    .join(" ");
  return (
    <svg width={width} height={height} className="overflow-visible text-primary">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}
