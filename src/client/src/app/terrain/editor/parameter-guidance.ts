// Presentation guidance mirrors the current Core contract; Core remains the canonical validator.
const UNIT_RANGE = { min: 0, max: 1 } as const;
const DIMENSION_RANGE = { min: 2, max: 512 } as const;
export const INPUT_GUIDANCE = {
  seed: { min: -2147483648, max: 2147483647 },
  width: DIMENSION_RANGE,
  height: DIMENSION_RANGE,
  heightMultiplier: { min: 0, max: 1000 },
  noiseScale: { min: 0.0001, max: 1 },
  octaves: { min: 1, max: 8 },
  globalWarmth: UNIT_RANGE,
  globalMoisture: UNIT_RANGE,
  vegetationDensity: UNIT_RANGE,
  plainsCoverage: UNIT_RANGE,
  mountainCoverage: UNIT_RANGE,
  seaLevel: UNIT_RANGE,
  mountainStrength: UNIT_RANGE,
  rainfall: UNIT_RANGE,
  evaporation: UNIT_RANGE,
  warpStrength: { min: 0, max: 8 },
  landformRegionScale: { min: 0.25, max: 4 },
  iterations: { min: 0, max: 2048 },
} as const;
export type ParameterName = keyof typeof INPUT_GUIDANCE;
const WORK_BUDGET_GUIDANCE = 33_554_432;
const COVERAGE_BUDGET = UNIT_RANGE.max;

export const SLIDER_GUIDANCE = {
  mountainStrength: INPUT_GUIDANCE.mountainStrength,
  warpStrength: INPUT_GUIDANCE.warpStrength,
  plainsCoverage: INPUT_GUIDANCE.plainsCoverage,
  mountainCoverage: INPUT_GUIDANCE.mountainCoverage,
} as const;

/** Presentation only: invalid/missing drafts have no fabricated balance. */
export function coverageBalance(plains: number | null, mountains: number | null) {
  if (coverageLimit(plains) === null || coverageLimit(mountains) === null) return null;
  const used = plains! + mountains!;
  return {
    plains: plains!,
    mountains: mountains!,
    hills: Math.max(0, COVERAGE_BUDGET - used),
    excess: Math.max(0, used - COVERAGE_BUDGET),
  };
}

export function coverageLimit(other: number | null): number | null {
  return other !== null && Number.isFinite(other) && other >= 0 && other <= COVERAGE_BUDGET
    ? Math.max(0, COVERAGE_BUDGET - other)
    : null;
}

export function iterationLimit(width: number | null, height: number | null): number | null {
  if (
    width === null ||
    height === null ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < INPUT_GUIDANCE.width.min ||
    width > INPUT_GUIDANCE.width.max ||
    height < INPUT_GUIDANCE.height.min ||
    height > INPUT_GUIDANCE.height.max
  )
    return null;
  return Math.min(
    INPUT_GUIDANCE.iterations.max,
    Math.floor(WORK_BUDGET_GUIDANCE / (width * height)),
  );
}
