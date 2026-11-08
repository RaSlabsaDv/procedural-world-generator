import type { TerrainRequest } from '../../terrain/data/terrain.models';
import {
  DEFAULT_MEASURED_PAIRS,
  EXPERIMENT_ORDER,
  EXPERIMENT_SCHEMA_VERSION,
  ExperimentConfiguration,
  MAX_MEASURED_PAIRS,
  MIN_MEASURED_PAIRS,
  WARMUP_PAIRS,
} from './experiment.models';

/** Capture only; Core validates terrain before future runner preparation. */
export function createExperimentConfiguration(
  request: TerrainRequest,
  measuredPairs = DEFAULT_MEASURED_PAIRS,
): ExperimentConfiguration {
  if (
    !Number.isInteger(measuredPairs) ||
    measuredPairs < MIN_MEASURED_PAIRS ||
    measuredPairs > MAX_MEASURED_PAIRS
  ) {
    throw new RangeError(
      `Measured pairs must be an integer from ${MIN_MEASURED_PAIRS} to ${MAX_MEASURED_PAIRS}.`,
    );
  }
  const heightMap = Object.freeze({
    seed: request.heightMap.seed,
    width: request.heightMap.width,
    height: request.heightMap.height,
    noiseScale: request.heightMap.noiseScale,
    octaves: request.heightMap.octaves,
    heightMultiplier: request.heightMap.heightMultiplier,
    algorithmVersion: request.heightMap.algorithmVersion,
  });
  const terrain = Object.freeze({
    heightMap,
    mountainStrength: request.mountainStrength,
    warpStrength: request.warpStrength,
    iterations: request.iterations,
    plainsCoverage: request.plainsCoverage,
    mountainCoverage: request.mountainCoverage,
    globalWarmth: request.globalWarmth,
    vegetationDensity: request.vegetationDensity,
    landformRegionScale: request.landformRegionScale,
    globalMoisture: request.globalMoisture,
    seaLevel: request.seaLevel,
    rainfall: request.rainfall,
    evaporation: request.evaporation,
    algorithmVersion: request.algorithmVersion,
  } satisfies TerrainRequest);
  return Object.freeze({
    schemaVersion: EXPERIMENT_SCHEMA_VERSION,
    terrain,
    measuredPairs,
    warmupPairs: WARMUP_PAIRS,
    order: EXPERIMENT_ORDER,
  });
}
