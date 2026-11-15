import * as THREE from 'three';

/**
 * Shared anatomical landmarks (meters, standing straight, facing +Z, feet at y = 0).
 * Subject's anatomical LEFT is +X (viewer's right in anterior view).
 * Subject's anatomical RIGHT is -X (viewer's left in anterior view).
 */
export const BODY_HEIGHT = 1.8;

export const LANDMARKS = {
  footSoleY: 0.0,
  ankleY: 0.08,
  kneeY: 0.49,
  hipY: 0.92,
  pelvisCenterY: 0.95,
  navelY: 1.09,
  diaphragmY: 1.24,
  heartCenter: new THREE.Vector3(0.026, 1.32, 0.032),
  sternumTopY: 1.44,
  clavicleY: 1.45,
  shoulderY: 1.44,
  shoulderX: 0.195,
  elbowX: 0.255,
  elbowY: 1.15,
  elbowZ: -0.01,
  wristX: 0.305,
  wristY: 0.91,
  wristZ: 0.025,
  handTipY: 0.74,
  neckBaseY: 1.47,
  jawY: 1.57,
  headCenterY: 1.675,
  crownY: 1.8,
  hipOffsetX: 0.095,
  kneeOffsetX: 0.098,
  ankleOffsetX: 0.098,
};

/**
 * Computes spine S-curve Z offset at height y (between sacrum 0.88 and C1 1.56).
 */
export function spineCurveZ(y: number): number {
  const t = THREE.MathUtils.clamp((y - 0.86) / (1.58 - 0.86), 0, 1);
  // Sacrum posterior -> lumbar lordosis (+Z) -> thoracic kyphosis (-Z) -> cervical lordosis (+Z)
  return (
    -0.045 +
    Math.sin(t * Math.PI * 2.15) * 0.028 +
    Math.sin(t * Math.PI) * 0.012
  );
}

/**
 * Helper returning left (+1) or right (-1) X coordinate for symmetrical structures.
 */
export function sideX(side: 1 | -1, absX: number): number {
  return side * absX;
}
