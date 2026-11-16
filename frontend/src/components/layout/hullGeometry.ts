/**
 * Configuration géométrique paramétrique du panneau holographique (référence 425 × 560 px).
 * Chaque paramètre permet d'ajuster indépendamment l'inclinaison, les courbures et les marges.
 */
export const HULL_GEOMETRY_CONFIG = {
  viewBoxWidth: 425,
  viewBoxHeight: 560,
  topY: 14,
  bottomY: 546,
  cornerRadiusY: 20,

  // Décalage oblique entre haut et bas du panneau pour accentuer l'inclinaison spatiale
  obliqueTopShiftX: 12,
  obliqueBottomShiftX: -8,

  // Courbure du bord gauche (convexe vers l'extérieur gauche, point lumineux principal)
  leftBaseX: 58,
  leftCurveIntensity: 44,

  // Courbure du bord droit (concave vers l'intérieur au centre, retour progressif aux extrémités)
  rightBaseX: 404,
  rightCurveIntensity: 44,

  // Courbures des extrémités et des séparateurs internes
  topBottomArch: 10,
  dividerArch: 5.5,

  // Marges internes garantissant l'absence de coupure des textes, icônes et chevrons
  contentTopInset: 18,
  contentBottomInset: 18,
  rowSafeInsetLeft: 14,
  rowSafeInsetRight: 16,

  // Dimensions harmonisées des icônes et espacements
  iconBoxSizePx: 28,
  iconVisualSizePx: 20,
  iconStrokeWidth: 1.85,
  iconTextGapPx: 14,
} as const;

export function evalQuadBezier(p0: number, pc: number, p1: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * p0 + 2 * mt * t * pc + t * t * p1;
}

export interface ComputedHullGeometry {
  hullPath: string;
  clipPathNormalized: string;
  leftEdgePath: string;
  rightEdgePath: string;
  dividers: { key: number; d: string }[];
  rowInsets: { paddingLeftPct: string; paddingRightPct: string }[];
}

export function buildHullGeometry(itemCount: number): ComputedHullGeometry {
  const {
    viewBoxWidth: W,
    viewBoxHeight: H,
    topY,
    bottomY,
    cornerRadiusY: cy,
    obliqueTopShiftX,
    obliqueBottomShiftX,
    leftBaseX,
    leftCurveIntensity,
    rightBaseX,
    rightCurveIntensity,
    topBottomArch,
    dividerArch,
    contentTopInset,
    contentBottomInset,
    rowSafeInsetLeft,
    rowSafeInsetRight,
  } = HULL_GEOMETRY_CONFIG;

  const ySideTop = topY + cy;
  const ySideBot = bottomY - cy;
  const midY = (ySideTop + ySideBot) / 2;

  // Coordonnées obliques aux extrémités supérieure et inférieure
  const leftTopX = leftBaseX + obliqueTopShiftX;
  const leftBotX = leftBaseX + obliqueBottomShiftX;
  const leftAvgX = (leftTopX + leftBotX) / 2;
  const leftControlX = leftAvgX - 2 * leftCurveIntensity;

  const rightTopX = rightBaseX + obliqueTopShiftX;
  const rightBotX = rightBaseX + obliqueBottomShiftX;
  const rightAvgX = (rightTopX + rightBotX) / 2;
  const rightControlX = rightAvgX - 2 * rightCurveIntensity;

  const topMidX = (leftTopX + rightTopX) / 2;
  const botMidX = (leftBotX + rightBotX) / 2;

  const hullPath = [
    `M ${leftTopX + 14},${topY}`,
    `Q ${topMidX},${topY - topBottomArch} ${rightTopX - 14},${topY}`,
    `Q ${rightTopX + 2},${topY + 2} ${rightTopX},${ySideTop}`,
    // Bordure droite concave prononcée au centre, revenant vers l'extérieur aux extrémités
    `Q ${rightControlX},${midY} ${rightBotX},${ySideBot}`,
    `Q ${rightBotX + 2},${bottomY - 2} ${rightBotX - 14},${bottomY}`,
    `Q ${botMidX},${bottomY + topBottomArch} ${leftBotX + 14},${bottomY}`,
    `Q ${leftBotX - 2},${bottomY - 2} ${leftBotX},${ySideBot}`,
    // Bordure gauche convexe fluide vers l'extérieur gauche
    `Q ${leftControlX},${midY} ${leftTopX},${ySideTop}`,
    `Q ${leftTopX - 2},${topY + 2} ${leftTopX + 14},${topY}`,
    'Z',
  ].join(' ');

  const nx = (x: number) => (x / W).toFixed(4);
  const ny = (y: number) => (y / H).toFixed(4);

  const clipPathNormalized = [
    `M ${nx(leftTopX + 14)},${ny(topY)}`,
    `Q ${nx(topMidX)},${ny(topY - topBottomArch)} ${nx(rightTopX - 14)},${ny(topY)}`,
    `Q ${nx(rightTopX + 2)},${ny(topY + 2)} ${nx(rightTopX)},${ny(ySideTop)}`,
    `Q ${nx(rightControlX)},${ny(midY)} ${nx(rightBotX)},${ny(ySideBot)}`,
    `Q ${nx(rightBotX + 2)},${ny(bottomY - 2)} ${nx(rightBotX - 14)},${ny(bottomY)}`,
    `Q ${nx(botMidX)},${ny(bottomY + topBottomArch)} ${nx(leftBotX + 14)},${ny(bottomY)}`,
    `Q ${nx(leftBotX - 2)},${ny(bottomY - 2)} ${nx(leftBotX)},${ny(ySideBot)}`,
    `Q ${nx(leftControlX)},${ny(midY)} ${nx(leftTopX)},${ny(ySideTop)}`,
    `Q ${nx(leftTopX - 2)},${ny(topY + 2)} ${nx(leftTopX + 14)},${ny(topY)}`,
    'Z',
  ].join(' ');

  const leftEdgePath = [
    `M ${leftTopX + 14},${topY}`,
    `Q ${leftTopX - 2},${topY + 2} ${leftTopX},${ySideTop}`,
    `Q ${leftControlX},${midY} ${leftBotX},${ySideBot}`,
    `Q ${leftBotX - 2},${bottomY - 2} ${leftBotX + 14},${bottomY}`,
  ].join(' ');

  const rightEdgePath = [
    `M ${rightTopX - 14},${topY}`,
    `Q ${rightTopX + 2},${topY + 2} ${rightTopX},${ySideTop}`,
    `Q ${rightControlX},${midY} ${rightBotX},${ySideBot}`,
    `Q ${rightBotX + 2},${bottomY - 2} ${rightBotX - 14},${bottomY}`,
  ].join(' ');

  const contentTop = topY + contentTopInset;
  const contentHeight = bottomY - topY - contentTopInset - contentBottomInset;
  const rowHeight = contentHeight / itemCount;

  const dividers = Array.from({ length: itemCount - 1 }, (_, i) => {
    const y = contentTop + rowHeight * (i + 1);
    const t = Math.min(1, Math.max(0, (y - ySideTop) / (ySideBot - ySideTop)));
    const xL = evalQuadBezier(leftTopX, leftControlX, leftBotX, t) + 8;
    const xR = evalQuadBezier(rightTopX, rightControlX, rightBotX, t) - 8;
    const xM = (xL + xR) / 2;
    return {
      key: i,
      d: `M ${xL.toFixed(1)},${y.toFixed(1)} Q ${xM.toFixed(1)},${(y + dividerArch).toFixed(1)} ${xR.toFixed(1)},${y.toFixed(1)}`,
    };
  });

  const rowInsets = Array.from({ length: itemCount }, (_, index) => {
    const rowCenterY = contentTop + rowHeight * (index + 0.5);
    const t = Math.min(1, Math.max(0, (rowCenterY - ySideTop) / (ySideBot - ySideTop)));
    const xL = evalQuadBezier(leftTopX, leftControlX, leftBotX, t);
    const xR = evalQuadBezier(rightTopX, rightControlX, rightBotX, t);
    return {
      paddingLeftPct: `${(((xL + rowSafeInsetLeft) / W) * 100).toFixed(2)}%`,
      paddingRightPct: `${(((W - xR + rowSafeInsetRight) / W) * 100).toFixed(2)}%`,
    };
  });

  return {
    hullPath,
    clipPathNormalized,
    leftEdgePath,
    rightEdgePath,
    dividers,
    rowInsets,
  };
}
