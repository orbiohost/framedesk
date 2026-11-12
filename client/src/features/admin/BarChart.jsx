import { useState } from 'react';

const WIDTH = 560;
// The chart fill is a CSS token validated for both themes (see styles/index.css).
const CHART_FILL = 'rgb(var(--color-chart))';
const PAD = { top: 12, right: 8, bottom: 24, left: 48 };
const GAP = 2;
const RADIUS = 4;

// Rounds the axis top up to 1, 2 or 5 x a power of ten.
function niceMax(value) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((candidate) => candidate * power >= value);
  return step * power;
}

// A bar with 4px rounded top corners, square at the baseline.
function barPath(x, y, width, height) {
  const radius = Math.min(RADIUS, width / 2, height);
  return [
    `M${x},${y + height}`,
    `V${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `H${x + width - radius}`,
    `Q${x + width},${y} ${x + width},${y + radius}`,
    `V${y + height}`,
    'Z',
  ].join(' ');
}

function DataTable({ data, valueLabel, formatValue }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="text-muted hover:text-ink cursor-pointer">Show as table</summary>
      <table className="mt-2 w-full">
        <thead className="text-muted text-left text-xs">
          <tr>
            <th className="py-1 font-medium">Period</th>
            <th className="py-1 text-right font-medium">{valueLabel}</th>
          </tr>
        </thead>
        <tbody className="divide-line divide-y">
          {data.map((point) => (
            <tr key={point.key}>
              <td className="py-1">{point.label}</td>
              <td className="py-1 text-right tabular-nums">{formatValue(point.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

// Single-series column chart: one colour (validated chart token), no legend
// (the title names the series), hover/focus tooltip per column, table view.
export function BarChart({
  title,
  data,
  valueLabel,
  formatValue,
  formatAxis = formatValue,
  height = 200,
}) {
  const [active, setActive] = useState(null);
  const top = niceMax(Math.max(...data.map((point) => point.value)));
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = height - PAD.top - PAD.bottom;
  const band = plotWidth / data.length;
  const yFor = (value) => PAD.top + plotHeight - (value / top) * plotHeight;
  const labelIndexes = new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]);
  const activePoint = active === null ? null : data[active];
  const isEmpty = data.every((point) => point.value === 0);
  // Whole-number ticks only, so a count axis never reads 0.5.
  const ticks = isEmpty ? [0] : Number.isInteger(top / 2) ? [0, top / 2, top] : [0, top];

  return (
    <figure className="border-line bg-surface rounded-lg border p-4">
      <figcaption className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <span className="text-muted text-sm tabular-nums" aria-live="polite">
          {activePoint ? `${activePoint.label}: ${formatValue(activePoint.value)}` : ''}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="w-full overflow-visible"
        role="img"
        aria-label={`${title}. Use the table below for exact values.`}
        onMouseLeave={() => setActive(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={yFor(tick)}
              y2={yFor(tick)}
              className="stroke-line"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={yFor(tick)}
              dy="0.32em"
              textAnchor="end"
              className="fill-muted text-[13px]"
            >
              {formatAxis(tick)}
            </text>
          </g>
        ))}
        {data.map((point, index) => {
          const x = PAD.left + index * band + GAP / 2;
          const barHeight = (point.value / top) * plotHeight;
          return (
            <g key={point.key}>
              {point.value > 0 && (
                <path
                  d={barPath(x, yFor(point.value), Math.max(band - GAP, 1), barHeight)}
                  fill={CHART_FILL}
                  className="transition-opacity"
                  opacity={active === null || active === index ? 1 : 0.45}
                />
              )}
              {labelIndexes.has(index) && (
                <text
                  x={x + (band - GAP) / 2}
                  y={height - 6}
                  textAnchor="middle"
                  className="fill-muted text-[13px]"
                >
                  {point.label}
                </text>
              )}
              {/* Full-height hit target, wider than the bar, for mouse and keyboard. */}
              <rect
                x={PAD.left + index * band}
                y={PAD.top}
                width={band}
                height={plotHeight}
                fill="transparent"
                tabIndex={0}
                aria-label={`${point.label}: ${formatValue(point.value)}`}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                className="outline-none"
              />
            </g>
          );
        })}
        {isEmpty && (
          <text
            x={PAD.left + plotWidth / 2}
            y={PAD.top + plotHeight / 2}
            textAnchor="middle"
            className="fill-muted text-[14px]"
          >
            Nothing recorded yet
          </text>
        )}
      </svg>
      <DataTable data={data} valueLabel={valueLabel} formatValue={formatValue} />
    </figure>
  );
}
