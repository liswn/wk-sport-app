import type { PlanSegment } from "../../model";

export type DistributionBlock = {
  key: string;
  name: string;
  minutes: number;
  range?: [number, number];
  kind: string;
  start: number;
  end: number;
  power: number;
};

export function PowerDistribution({
  segments,
  ftp,
}: {
  segments: PlanSegment[];
  ftp: number;
}) {
  const blocks = buildDistributionBlocks(segments, ftp);
  const totalMinutes = blocks.reduce((sum, block) => sum + block.minutes, 0);
  if (!blocks.length || totalMinutes <= 0) return null;
  const maxPercent = Math.max(
    130,
    Math.ceil(
      Math.max(...blocks.map((block) => powerPercent(block.power, ftp))) / 10,
    ) * 10,
  );

  return (
    <div
      className="power-distribution"
      aria-label={`计划功率轮廓，${totalMinutes}分钟`}
    >
      <PowerProfileSvg
        blocks={blocks}
        ftp={ftp}
        totalMinutes={totalMinutes}
        minPercent={30}
        maxPercent={maxPercent}
      />
    </div>
  );
}

export function PowerProfileSvg({
  blocks,
  ftp,
  totalMinutes,
  minPercent,
  maxPercent,
}: {
  blocks: DistributionBlock[];
  ftp: number;
  totalMinutes: number;
  minPercent: number;
  maxPercent: number;
}) {
  const width = 700;
  const height = 170;
  const left = 46;
  const right = 42;
  const top = 12;
  const bottom = 26;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const yFor = (percent: number) =>
    top + ((maxPercent - percent) / (maxPercent - minPercent)) * chartHeight;
  const xFor = (minute: number) => left + (minute / totalMinutes) * chartWidth;
  const baseline = yFor(minPercent);
  const ftpY = yFor(100);
  const timeMarks = [0, 15, 30, 45, 60, totalMinutes].filter(
    (value, index, list) =>
      value <= totalMinutes && list.indexOf(value) === index,
  );

  return (
    <svg
      className="power-profile-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="计划功率百分比图"
      tabIndex={-1}
      focusable="false"
    >
      <text x={14} y={yFor(130) + 4} className="power-axis-label">
        130%
      </text>
      <text x={18} y={yFor(80) + 4} className="power-axis-label">
        80%
      </text>
      <text x={18} y={yFor(30) + 4} className="power-axis-label">
        30%
      </text>
      {[30, 80, 130].map((mark) => (
        <line
          key={mark}
          x1={left}
          x2={width - right}
          y1={yFor(mark)}
          y2={yFor(mark)}
          className="power-grid-line"
        />
      ))}
      <line
        x1={left}
        x2={width - right + 2}
        y1={ftpY}
        y2={ftpY}
        className="power-ftp-line"
      />
      <text x={width - right + 8} y={ftpY + 4} className="power-ftp-label">
        FTP
      </text>
      {blocks.map((block) => {
        const x1 = xFor(block.start);
        const x2 = xFor(block.end);
        const y = yFor(powerPercent(block.power, ftp));
        const points = [
          `${x1},${baseline}`,
          `${x1},${y}`,
          `${x2},${y}`,
          `${x2},${baseline}`,
        ].join(" ");
        return (
          <polygon
            key={block.key}
            points={points}
            className={`power-shape ${block.kind}`}
          />
        );
      })}
      {timeMarks.map((minute) => (
        <text
          key={minute}
          x={xFor(minute)}
          y={height - 5}
          className="power-time-label"
          textAnchor={
            minute === 0 ? "start" : minute === totalMinutes ? "end" : "middle"
          }
        >
          {minute}:00
        </text>
      ))}
    </svg>
  );
}

export function buildDistributionBlocks(segments: PlanSegment[], ftp: number) {
  let cursor = 0;
  return segments.flatMap((segment, segmentIndex) => {
    const repeat = Math.max(1, Math.round(segment.repeat ?? 1));
    const workMinutes = Math.max(0, Math.round(segment.durationMinutes ?? 0));
    const recoveryMinutes = Math.max(
      0,
      Math.round(segment.recoveryMinutes ?? 0),
    );
    const blocks: DistributionBlock[] = [];
    for (let index = 0; index < repeat; index += 1) {
      if (workMinutes > 0) {
        const start = cursor;
        const end = cursor + workMinutes;
        blocks.push({
          key: `${segmentIndex}-${index}-work`,
          name: segment.name,
          minutes: workMinutes,
          range: segment.targetPowerRange,
          kind: labelPowerBlockKind(segment.targetPowerRange, ftp),
          start,
          end,
          power: averagePowerForRange(segment.targetPowerRange, ftp),
        });
        cursor = end;
      }
      if (recoveryMinutes > 0) {
        const start = cursor;
        const end = cursor + recoveryMinutes;
        blocks.push({
          key: `${segmentIndex}-${index}-recovery`,
          name: "恢复",
          minutes: recoveryMinutes,
          range: segment.recoveryPowerRange,
          kind: labelPowerBlockKind(segment.recoveryPowerRange, ftp),
          start,
          end,
          power: averagePowerForRange(segment.recoveryPowerRange, ftp),
        });
        cursor = end;
      }
    }
    return blocks;
  });
}

export function labelPowerBlockKind(
  range: [number, number] | undefined,
  ftp: number,
) {
  if (!range || !ftp) return "pd-z2";
  const ratio = (range[0] + range[1]) / 2 / ftp;
  if (ratio < 0.62) return "pd-recovery";
  if (ratio < 0.78) return "pd-z2";
  if (ratio < 0.88) return "pd-tempo";
  if (ratio < 0.95) return "pd-sweet";
  return "pd-threshold";
}

export function averagePowerForRange(
  range: [number, number] | undefined,
  ftp: number,
) {
  if (!range) return Math.round(ftp * 0.55);
  return Math.round((range[0] + range[1]) / 2);
}

export function powerPercent(power: number, ftp: number) {
  if (!ftp) return 0;
  return Math.round((power / ftp) * 100);
}
