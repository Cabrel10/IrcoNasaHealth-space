import * as THREE from 'three';
import type { MaterialRegistry } from './materials';
import { LANDMARKS, sideX } from './proportions';
import { createTaperedTube, tagAnatomicalPart } from './geometryUtils';

/**
 * Generates a high-resolution, anatomically sculpted male torso, neck, and facial shell
 * (zero wireframe artifacts; smooth Fresnel glass contours with sculpted face, chest, and shoulders).
 */
function buildTorsoHeadShellGeometry(): THREE.BufferGeometry {
  interface Slice {
    y: number;
    rx: number;
    rz: number;
    zOffset: number;
  }

  const slices: Slice[] = [
    { y: 0.85, rx: 0.166, rz: 0.112, zOffset: -0.004 }, // Pelvic base
    { y: 0.93, rx: 0.174, rz: 0.118, zOffset: -0.002 }, // Hip / greater trochanter
    { y: 1.02, rx: 0.156, rz: 0.106, zOffset: 0.004 },  // Iliac waist
    { y: 1.11, rx: 0.148, rz: 0.104, zOffset: 0.006 },  // Navel waist
    { y: 1.22, rx: 0.168, rz: 0.115, zOffset: 0.008 },  // Lower ribcage
    { y: 1.32, rx: 0.192, rz: 0.128, zOffset: 0.006 },  // Pectoral chest
    { y: 1.39, rx: 0.204, rz: 0.124, zOffset: 0.004 },  // Upper chest
    { y: 1.44, rx: 0.208, rz: 0.112, zOffset: 0.002 },  // Shoulder / clavicle line
    { y: 1.468, rx: 0.128, rz: 0.084, zOffset: 0.003 }, // Trapezius taper
    { y: 1.495, rx: 0.074, rz: 0.068, zOffset: 0.005 }, // Lower neck
    { y: 1.545, rx: 0.061, rz: 0.063, zOffset: 0.006 }, // Mid neck
    { y: 1.568, rx: 0.066, rz: 0.084, zOffset: 0.015 }, // Submental / jaw base
    { y: 1.59, rx: 0.072, rz: 0.098, zOffset: 0.017 },  // Chin / mandibular angle
    { y: 1.622, rx: 0.077, rz: 0.103, zOffset: 0.014 }, // Lips / maxilla
    { y: 1.655, rx: 0.082, rz: 0.106, zOffset: 0.011 }, // Cheekbones / nose tip
    { y: 1.682, rx: 0.084, rz: 0.106, zOffset: 0.008 }, // Orbital sockets / nose bridge
    { y: 1.706, rx: 0.086, rz: 0.107, zOffset: 0.005 }, // Supraorbital brow ridge
    { y: 1.745, rx: 0.083, rz: 0.103, zOffset: 0.0 },   // Forehead
    { y: 1.782, rx: 0.062, rz: 0.076, zOffset: -0.006 }, // Parietal dome
    { y: 1.805, rx: 0.004, rz: 0.004, zOffset: -0.008 }, // Crown apex
  ];

  const radialSegs = 56;
  const rows = slices.length;
  const positions = new Float32Array(rows * (radialSegs + 1) * 3);
  const uvs = new Float32Array(rows * (radialSegs + 1) * 2);
  const indices: number[] = [];

  let pIdx = 0;
  let uvIdx = 0;
  for (let r = 0; r < rows; r++) {
    const s = slices[r];
    const v = r / (rows - 1);
    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const theta = u * Math.PI * 2;
      const cos = Math.cos(theta); // +/-1 = left/right X
      const sin = Math.sin(theta); // +1 = anterior +Z, -1 = posterior -Z

      let x = cos * s.rx;
      let z = sin * s.rz + s.zOffset;

      // Sculpted pectoral chest shelf & sternal cleft
      if (s.y >= 1.26 && s.y <= 1.42 && sin > 0.1) {
        const pecBell = Math.sin(Math.min(1, Math.abs(cos) * 1.4) * Math.PI);
        const sternalDip = Math.exp(-Math.pow(cos / 0.14, 2)) * 0.008;
        z += (0.011 * pecBell - sternalDip) * Math.pow(sin, 1.4);
      }

      // Sculpted facial features on anterior head (+Z, sin > 0.35)
      if (s.y >= 1.58 && s.y <= 1.74 && sin > 0.35) {
        // Cheekbone prominence
        if (s.y >= 1.63 && s.y <= 1.67) {
          const cheek = Math.exp(-Math.pow((Math.abs(cos) - 0.52) / 0.22, 2));
          z += cheek * 0.009;
        }
        // Eye socket recesses
        if (s.y >= 1.668 && s.y <= 1.698) {
          const eye = Math.exp(-Math.pow((Math.abs(cos) - 0.34) / 0.16, 2));
          z -= eye * 0.011;
        }
        // Nose bridge & nasal tip
        if (s.y >= 1.635 && s.y <= 1.705) {
          const noseCenter = Math.exp(-Math.pow(cos / 0.12, 2));
          const tipHeight = 1 - Math.abs(s.y - 1.655) / 0.05;
          z += noseCenter * Math.max(0, tipHeight) * 0.022;
        }
        // Brow ridge
        if (s.y >= 1.698 && s.y <= 1.716) {
          const brow = Math.exp(-Math.pow(cos / 0.65, 2));
          z += brow * 0.007;
        }
        // Chin & jaw taper
        if (s.y >= 1.585 && s.y <= 1.605) {
          const chin = Math.exp(-Math.pow(cos / 0.22, 2));
          z += chin * 0.008;
        }
      }

      // Subtle ear silhouette hints on lateral head
      if (s.y >= 1.625 && s.y <= 1.685 && Math.abs(cos) > 0.92) {
        x += Math.sign(cos) * 0.008;
      }

      positions[pIdx++] = x;
      positions[pIdx++] = s.y;
      positions[pIdx++] = z;

      uvs[uvIdx++] = u;
      uvs[uvIdx++] = v;
    }
  }

  for (let r = 0; r < rows - 1; r++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = r * (radialSegs + 1) + j;
      const b = (r + 1) * (radialSegs + 1) + j;
      const c = (r + 1) * (radialSegs + 1) + (j + 1);
      const d = r * (radialSegs + 1) + (j + 1);
      indices.push(a, d, b);
      indices.push(b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setIndex(indices);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

export function buildHolographicSkinSystem(materials: MaterialRegistry): {
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
} {
  const group = new THREE.Group();
  group.name = 'system_skin';
  const geometries: THREE.BufferGeometry[] = [];
  const track = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };

  const skinMat = materials.getSkinMaterial('holo_skin');

  const addShellPart = (geo: THREE.BufferGeometry, flattenZ = 1) => {
    const mesh = new THREE.Mesh(geo, skinMat);
    mesh.renderOrder = 10;
    mesh.scale.z = flattenZ;
    group.add(mesh);
  };

  // Sculpted Torso, Neck & Head
  addShellPart(track(buildTorsoHeadShellGeometry()));

  // Arms, Sculpted Palms, 5 Fingers & Legs
  for (const s of [-1, 1] as const) {
    const sh = new THREE.Vector3(sideX(s, LANDMARKS.shoulderX - 0.01), LANDMARKS.shoulderY, 0);
    const el = new THREE.Vector3(sideX(s, LANDMARKS.elbowX), LANDMARKS.elbowY, LANDMARKS.elbowZ);
    const wr = new THREE.Vector3(sideX(s, LANDMARKS.wristX), LANDMARKS.wristY, LANDMARKS.wristZ);

    // Shoulder -> Arm -> Forearm -> Palm envelope
    const armGeo = track(
      createTaperedTube(
        [
          sh.clone().add(new THREE.Vector3(-s * 0.015, 0.015, 0)),
          sh.clone().lerp(el, 0.38).add(new THREE.Vector3(s * 0.008, 0, 0)),
          el,
          el.clone().lerp(wr, 0.35).add(new THREE.Vector3(s * 0.005, 0, 0.004)),
          wr,
          wr.clone().add(new THREE.Vector3(s * 0.012, -0.05, 0.005)),
        ],
        (t) => {
          if (t < 0.16) return THREE.MathUtils.lerp(0.064, 0.056, t / 0.16);
          if (t < 0.45) return THREE.MathUtils.lerp(0.056, 0.044, (t - 0.16) / 0.29);
          if (t < 0.85) return THREE.MathUtils.lerp(0.044, 0.032, (t - 0.45) / 0.4);
          return THREE.MathUtils.lerp(0.032, 0.036, (t - 0.85) / 0.15);
        },
        34,
        20,
      ),
    );
    addShellPart(armGeo, 0.86);

    // Individual Holographic Fingers & Thumb (open palm facing forward)
    for (let f = 0; f < 5; f++) {
      const spread = (2 - f) * 0.011;
      const isThumb = f === 0;
      const basePos = wr
        .clone()
        .add(new THREE.Vector3(s * (0.006 + (2 - f) * 0.011), -0.04, 0.005));
      const len = isThumb ? 0.062 : f === 2 ? 0.115 : f === 4 ? 0.088 : 0.105;
      const tipPos = basePos
        .clone()
        .add(
          new THREE.Vector3(
            s * (isThumb ? 0.046 : spread * 2.0 + 0.016),
            -len,
            0.012,
          ),
        );

      const fingerShellGeo = track(
        createTaperedTube(
          [basePos, basePos.clone().lerp(tipPos, 0.5), tipPos],
          (t) => (isThumb ? 0.0095 : 0.008) * (1 - t * 0.38),
          12,
          10,
        ),
      );
      addShellPart(fingerShellGeo);
    }

    // Thigh -> Knee -> Calf -> Ankle -> Foot
    const hip = new THREE.Vector3(sideX(s, LANDMARKS.hipOffsetX), LANDMARKS.hipY, 0);
    const knee = new THREE.Vector3(sideX(s, LANDMARKS.kneeOffsetX), LANDMARKS.kneeY, 0.008);
    const ankle = new THREE.Vector3(sideX(s, LANDMARKS.ankleOffsetX), LANDMARKS.ankleY, -0.005);

    const legGeo = track(
      createTaperedTube(
        [
          hip.clone().add(new THREE.Vector3(0, 0.03, 0)),
          hip.clone().lerp(knee, 0.42),
          knee,
          knee.clone().lerp(ankle, 0.34).add(new THREE.Vector3(0, 0, -0.01)),
          ankle,
          new THREE.Vector3(ankle.x, 0.032, 0.068),
          new THREE.Vector3(ankle.x, 0.022, 0.145),
        ],
        (t) => {
          if (t < 0.36) return THREE.MathUtils.lerp(0.095, 0.062, t / 0.36);
          if (t < 0.56) return THREE.MathUtils.lerp(0.062, 0.066, (t - 0.36) / 0.2);
          if (t < 0.82) return THREE.MathUtils.lerp(0.066, 0.041, (t - 0.56) / 0.26);
          return THREE.MathUtils.lerp(0.041, 0.022, (t - 0.82) / 0.18);
        },
        36,
        22,
      ),
    );
    addShellPart(legGeo);
  }

  tagAnatomicalPart(group, 'holo_skin');
  return { group, geometries };
}

/**
 * Lightweight holographic silhouette model for the Top-Right Secondary Orientation Inset.
 */
export function buildSilhouetteInsetModel(): {
  group: THREE.Group;
  dispose: () => void;
} {
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const track = <T extends THREE.BufferGeometry>(g: T): T => {
    geos.push(g);
    return g;
  };

  const bodyMat = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.75);
        vec3 col = mix(vec3(0.05, 0.24, 0.48), vec3(0.32, 0.82, 1.0), rim);
        float a = 0.2 + rim * 0.72;
        gl_FragColor = vec4(col, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const heartMat = new THREE.MeshBasicMaterial({
    color: 0xe63928,
    transparent: true,
    opacity: 0.92,
  });

  const torsoGeo = track(buildTorsoHeadShellGeometry());
  group.add(new THREE.Mesh(torsoGeo, bodyMat));

  for (const s of [-1, 1] as const) {
    const sh = new THREE.Vector3(sideX(s, LANDMARKS.shoulderX - 0.01), LANDMARKS.shoulderY, 0);
    const el = new THREE.Vector3(sideX(s, LANDMARKS.elbowX), LANDMARKS.elbowY, LANDMARKS.elbowZ);
    const wr = new THREE.Vector3(sideX(s, LANDMARKS.wristX), LANDMARKS.wristY, LANDMARKS.wristZ);
    const armGeo = track(
      createTaperedTube(
        [sh, el, wr, wr.clone().add(new THREE.Vector3(s * 0.02, -0.14, 0.01))],
        (t) => THREE.MathUtils.lerp(0.056, 0.018, t),
        16,
        10,
      ),
    );
    group.add(new THREE.Mesh(armGeo, bodyMat));

    const hip = new THREE.Vector3(sideX(s, LANDMARKS.hipOffsetX), LANDMARKS.hipY, 0);
    const knee = new THREE.Vector3(sideX(s, LANDMARKS.kneeOffsetX), LANDMARKS.kneeY, 0.008);
    const ankle = new THREE.Vector3(sideX(s, LANDMARKS.ankleOffsetX), LANDMARKS.ankleY, -0.005);
    const legGeo = track(
      createTaperedTube(
        [hip, knee, ankle, new THREE.Vector3(ankle.x, 0.02, 0.12)],
        (t) => THREE.MathUtils.lerp(0.088, 0.028, t),
        18,
        12,
      ),
    );
    group.add(new THREE.Mesh(legGeo, bodyMat));
  }

  const miniHeartGeo = track(new THREE.SphereGeometry(0.04, 12, 10));
  const miniHeart = new THREE.Mesh(miniHeartGeo, heartMat);
  miniHeart.position.copy(LANDMARKS.heartCenter);
  group.add(miniHeart);

  return {
    group,
    dispose: () => {
      geos.forEach((g) => g.dispose());
      bodyMat.dispose();
      heartMat.dispose();
    },
  };
}
