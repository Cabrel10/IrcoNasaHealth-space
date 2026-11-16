import * as THREE from 'three';
import type { DiagnosticSliceMode } from './types';

function createSliceLaminaTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;

  ctx.clearRect(0, 0, size, size);

  // Subtle translucent diagnostic radial field
  const grad = ctx.createRadialGradient(c, c, 12, c, c, c * 0.94);
  grad.addColorStop(0.0, 'rgba(56, 189, 248, 0.14)');
  grad.addColorStop(0.42, 'rgba(56, 189, 248, 0.06)');
  grad.addColorStop(0.72, 'rgba(14, 165, 233, 0.09)');
  grad.addColorStop(0.88, 'rgba(56, 189, 248, 0.02)');
  grad.addColorStop(1.0, 'rgba(56, 189, 248, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Anatomical layer-spread concentric stratum rings (cutaneous, muscular, visceral)
  const rings = [
    { r: 0.34, lw: 1.4, alpha: 0.48, dash: [] as number[] },
    { r: 0.54, lw: 1.2, alpha: 0.34, dash: [6, 6] },
    { r: 0.74, lw: 1.6, alpha: 0.55, dash: [] as number[] },
    { r: 0.88, lw: 1.0, alpha: 0.28, dash: [3, 8] },
  ];
  rings.forEach((ring) => {
    ctx.strokeStyle = `rgba(125, 211, 252, ${ring.alpha})`;
    ctx.lineWidth = ring.lw;
    ctx.setLineDash(ring.dash);
    ctx.beginPath();
    ctx.arc(c, c, ring.r * c, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  // Fine crosshairs and degree tick marks around the diagnostic plane
  ctx.strokeStyle = 'rgba(125, 211, 252, 0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(c - c * 0.9, c);
  ctx.lineTo(c - c * 0.76, c);
  ctx.moveTo(c + c * 0.76, c);
  ctx.lineTo(c + c * 0.9, c);
  ctx.moveTo(c, c - c * 0.9);
  ctx.lineTo(c, c - c * 0.76);
  ctx.moveTo(c, c + c * 0.76);
  ctx.lineTo(c, c + c * 0.9);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(125, 211, 252, 0.35)';
  for (let deg = 0; deg < 360; deg += 15) {
    const rad = (deg * Math.PI) / 180;
    const r0 = deg % 45 === 0 ? c * 0.71 : c * 0.725;
    const r1 = c * 0.74;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(rad) * r0, c + Math.sin(rad) * r0);
    ctx.lineTo(c + Math.cos(rad) * r1, c + Math.sin(rad) * r1);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createSegmentedArcRing(
  innerR: number,
  outerR: number,
  segments: number,
  colorHex: number,
  opacity: number,
): { group: THREE.Group; geometries: THREE.BufferGeometry[]; material: THREE.MeshBasicMaterial } {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const material = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const step = (Math.PI * 2) / segments;
  const arcLen = step * 0.64;
  for (let i = 0; i < segments; i++) {
    const geo = new THREE.RingGeometry(innerR, outerR, 14, 1, i * step, arcLen);
    geometries.push(geo);
    group.add(new THREE.Mesh(geo, material));
  }

  return { group, geometries, material };
}

export interface DiagnosticOverlaysController {
  group: THREE.Group;
  update: (params: {
    elapsed: number;
    sliceEnabled: boolean;
    sliceMode: DiagnosticSliceMode;
    slicePos: number;
    sliceHalf: number;
    liverAnomaly: number;
    kneeAnomaly: number;
    armAnomaly: number;
  }) => void;
  dispose: () => void;
}

export function buildDiagnosticOverlays(
  maxAnisotropy: number,
): DiagnosticOverlaysController {
  const group = new THREE.Group();
  group.name = 'diagnostic_overlays';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const laminaTex = createSliceLaminaTexture(maxAnisotropy);
  textures.push(laminaTex);

  // 1. Cross-Sectional "Layer Spread" Stack (3 parallel semi-transparent tomographic lamina discs)
  const sliceGroup = new THREE.Group();
  const discGeo = new THREE.PlaneGeometry(0.68, 0.68);
  geometries.push(discGeo);

  const laminaMats = [
    new THREE.MeshBasicMaterial({
      map: laminaTex,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    new THREE.MeshBasicMaterial({
      map: laminaTex,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  ];
  materials.push(...laminaMats);

  // Center tomographic plane + spread upper/lower boundary rings
  const centerDisc = new THREE.Mesh(discGeo, laminaMats[0]);
  centerDisc.rotation.x = -Math.PI / 2;
  centerDisc.renderOrder = 14;
  sliceGroup.add(centerDisc);

  const spreadUpper = new THREE.Mesh(discGeo, laminaMats[1]);
  spreadUpper.rotation.x = -Math.PI / 2;
  spreadUpper.scale.setScalar(0.92);
  spreadUpper.renderOrder = 14;
  sliceGroup.add(spreadUpper);

  const spreadLower = new THREE.Mesh(discGeo, laminaMats[1]);
  spreadLower.rotation.x = -Math.PI / 2;
  spreadLower.scale.setScalar(0.92);
  spreadLower.renderOrder = 14;
  sliceGroup.add(spreadLower);

  // Hairline outer boundary rings marking the spread envelope
  const boundGeo = new THREE.RingGeometry(0.248, 0.252, 72);
  geometries.push(boundGeo);
  const boundMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  materials.push(boundMat);

  const boundTop = new THREE.Mesh(boundGeo, boundMat);
  boundTop.rotation.x = -Math.PI / 2;
  const boundBot = new THREE.Mesh(boundGeo, boundMat);
  boundBot.rotation.x = -Math.PI / 2;
  sliceGroup.add(boundTop, boundBot);

  group.add(sliceGroup);

  // 2. Anomaly Zone Diagnostic Reticles (Warning Orange & Deep Magenta)
  // A. Hepatic Metabolic Zone (-0.048, 1.195, 0.032) — Warning Orange (#FF6B1A)
  const liverReticle = createSegmentedArcRing(0.088, 0.093, 4, 0xff6b1a, 0.58);
  geometries.push(...liverReticle.geometries);
  materials.push(liverReticle.material);
  liverReticle.group.position.set(-0.048, 1.195, 0.04);
  liverReticle.group.rotation.y = -0.18;
  group.add(liverReticle.group);

  // B. Left Knee Articular Inflammation (+0.095, 0.505, 0.008) — Deep Magenta (#D926A9)
  const kneeGroup = new THREE.Group();
  kneeGroup.position.set(0.095, 0.505, 0.01);
  const kneeOuter = createSegmentedArcRing(0.078, 0.082, 4, 0xd926a9, 0.68);
  const kneeInner = createSegmentedArcRing(0.064, 0.0665, 6, 0xf472b6, 0.45);
  geometries.push(...kneeOuter.geometries, ...kneeInner.geometries);
  materials.push(kneeOuter.material, kneeInner.material);
  kneeOuter.group.rotation.x = Math.PI / 2;
  kneeInner.group.rotation.x = Math.PI / 2;
  kneeGroup.add(kneeOuter.group, kneeInner.group);
  group.add(kneeGroup);

  // C. Right Forearm Perfusion Zone (-0.275, 0.96, 0.038) — Warning Amber-Orange (#FF8C1A)
  const armGroup = new THREE.Group();
  armGroup.position.set(-0.275, 0.96, 0.038);
  const armRing = createSegmentedArcRing(0.056, 0.06, 4, 0xff8c1a, 0.62);
  geometries.push(...armRing.geometries);
  materials.push(armRing.material);
  armRing.group.rotation.x = Math.PI / 2;
  armRing.group.rotation.y = -0.14;
  armGroup.add(armRing.group);
  group.add(armGroup);

  const update: DiagnosticOverlaysController['update'] = ({
    elapsed,
    sliceEnabled,
    sliceMode,
    slicePos,
    sliceHalf,
    liverAnomaly,
    kneeAnomaly,
    armAnomaly,
  }) => {
    sliceGroup.visible = sliceEnabled;
    if (sliceEnabled) {
      if (sliceMode === 'axial') {
        sliceGroup.rotation.set(0, 0, 0);
        sliceGroup.position.set(0, slicePos, 0.005);
        spreadUpper.position.set(0, sliceHalf * 0.52, 0);
        spreadLower.position.set(0, -sliceHalf * 0.52, 0);
        boundTop.position.set(0, sliceHalf, 0);
        boundBot.position.set(0, -sliceHalf, 0);
      } else {
        // Vertical Sagittal cross-section plane
        sliceGroup.rotation.set(0, 0, Math.PI / 2);
        sliceGroup.position.set(slicePos, 1.08, 0.005);
        spreadUpper.position.set(0, sliceHalf * 0.52, 0);
        spreadLower.position.set(0, -sliceHalf * 0.52, 0);
        boundTop.position.set(0, sliceHalf, 0);
        boundBot.position.set(0, -sliceHalf, 0);
      }
      centerDisc.rotation.z = elapsed * 0.09;
      spreadUpper.rotation.z = -elapsed * 0.06;
      spreadLower.rotation.z = elapsed * 0.06;
    }

    liverReticle.group.visible = liverAnomaly > 0.02;
    if (liverReticle.group.visible) {
      liverReticle.group.rotation.z = elapsed * 0.28;
      liverReticle.material.opacity = 0.52 * liverAnomaly;
    }

    kneeGroup.visible = kneeAnomaly > 0.02;
    if (kneeGroup.visible) {
      kneeOuter.group.rotation.z = elapsed * 0.35;
      kneeInner.group.rotation.z = -elapsed * 0.45;
      kneeOuter.material.opacity = 0.65 * kneeAnomaly;
      kneeInner.material.opacity = 0.44 * kneeAnomaly;
    }

    armGroup.visible = armAnomaly > 0.02;
    if (armGroup.visible) {
      armRing.group.rotation.z = -elapsed * 0.32;
      armRing.material.opacity = 0.58 * armAnomaly;
    }
  };

  const dispose = () => {
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
  };

  return { group, update, dispose };
}
