import * as THREE from 'three';
import { MaterialRegistry } from './materials';
import { LANDMARKS, sideX, spineCurveZ } from './proportions';
import { createTaperedTube, tagAnatomicalPart } from './geometryUtils';

export interface ArterialCorpuscleStream {
  mesh: THREE.InstancedMesh;
  curves: THREE.CatmullRomCurve3[];
  phases: Float32Array;
  curveIndices: Uint16Array;
  speeds: Float32Array;
}

export function buildCardiovascularSystem(materials: MaterialRegistry): {
  group: THREE.Group;
  heartGroup: THREE.Group;
  corpuscles: ArterialCorpuscleStream;
  geometries: THREE.BufferGeometry[];
} {
  const group = new THREE.Group();
  group.name = 'system_cardiovascular';
  const geometries: THREE.BufferGeometry[] = [];
  const track = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };

  // 1. Central Focal Point: Detailed Realistic Red Heart + Prominent Coronary Arteries
  const heartGroup = new THREE.Group();
  heartGroup.position.copy(LANDMARKS.heartCenter).add(new THREE.Vector3(-0.002, 0.004, 0.008));
  const heartMat = materials.getCardioMaterial('heart', true);
  const coronaryMat = materials.getCoronaryMaterial('heart');
  const venaMat = materials.getVenousMaterial('heart');

  // Sculpted Ventricular Myocardium (distinct left & right ventricular apex + anterior sulcus)
  const ventGeo = track(new THREE.SphereGeometry(0.056, 32, 24));
  const vAttr = ventGeo.attributes.position;
  for (let i = 0; i < vAttr.count; i++) {
    let x = vAttr.getX(i);
    let y = vAttr.getY(i);
    let z = vAttr.getZ(i);
    if (y < 0) {
      const taper = 1 + y * 8.4;
      x *= Math.max(0.32, taper);
      z *= Math.max(0.35, taper);
      y *= 1.4;
      x += -y * 0.38; // Leftward cardiac apex (+X)
      z += -y * 0.24; // Anterior tilt (+Z)
    } else {
      y *= 0.88;
      x *= 1.1;
    }
    // Subtle anterior interventricular groove
    if (z > 0.015 && Math.abs(x - 0.006) < 0.014) {
      z -= 0.004 * Math.cos(((x - 0.006) / 0.014) * (Math.PI / 2));
    }
    vAttr.setXYZ(i, x, y, z);
  }
  ventGeo.computeVertexNormals();
  heartGroup.add(new THREE.Mesh(ventGeo, heartMat));

  // Right & Left Atria / Auricles
  const atriumGeo = track(new THREE.SphereGeometry(0.027, 20, 16));
  const rightAtrium = new THREE.Mesh(atriumGeo, heartMat);
  rightAtrium.position.set(-0.034, 0.034, 0.002);
  const leftAtrium = new THREE.Mesh(atriumGeo, heartMat);
  leftAtrium.position.set(0.024, 0.038, -0.014);
  heartGroup.add(rightAtrium, leftAtrium);

  // Prominent Coronary Artery Tree hugging the anterior ventricular surface
  const coronaryPaths: { pts: THREE.Vector3[]; r0: number; r1: number }[] = [
    // Left Anterior Descending (LAD)
    {
      pts: [
        new THREE.Vector3(0.006, 0.034, 0.042),
        new THREE.Vector3(0.014, 0.008, 0.056),
        new THREE.Vector3(0.024, -0.024, 0.048),
        new THREE.Vector3(0.034, -0.058, 0.032),
      ],
      r0: 0.0038,
      r1: 0.0012,
    },
    // First Diagonal Branch (D1)
    {
      pts: [
        new THREE.Vector3(0.014, 0.008, 0.056),
        new THREE.Vector3(0.034, -0.008, 0.046),
        new THREE.Vector3(0.044, -0.032, 0.028),
      ],
      r0: 0.0024,
      r1: 0.0009,
    },
    // Second Diagonal Branch (D2)
    {
      pts: [
        new THREE.Vector3(0.022, -0.02, 0.048),
        new THREE.Vector3(0.038, -0.036, 0.034),
        new THREE.Vector3(0.042, -0.052, 0.018),
      ],
      r0: 0.002,
      r1: 0.0008,
    },
    // Right Coronary Artery (RCA) + Acute Marginal Branch
    {
      pts: [
        new THREE.Vector3(-0.014, 0.03, 0.042),
        new THREE.Vector3(-0.038, 0.008, 0.04),
        new THREE.Vector3(-0.032, -0.024, 0.034),
        new THREE.Vector3(-0.01, -0.048, 0.032),
      ],
      r0: 0.0035,
      r1: 0.0011,
    },
    {
      pts: [
        new THREE.Vector3(-0.036, 0.006, 0.04),
        new THREE.Vector3(-0.018, -0.016, 0.046),
        new THREE.Vector3(-0.004, -0.038, 0.042),
      ],
      r0: 0.0021,
      r1: 0.0008,
    },
  ];
  for (const cp of coronaryPaths) {
    const cGeo = track(
      createTaperedTube(cp.pts, (t) => THREE.MathUtils.lerp(cp.r0, cp.r1, t), 16, 8),
    );
    heartGroup.add(new THREE.Mesh(cGeo, coronaryMat));
  }

  // Ascending Aorta & Aortic Arch
  const aorticArchGeo = track(
    createTaperedTube(
      [
        new THREE.Vector3(-0.002, 0.026, 0.01),
        new THREE.Vector3(-0.016, 0.082, 0.014),
        new THREE.Vector3(0.0, 0.102, -0.012),
        new THREE.Vector3(0.012, 0.064, -0.04),
        new THREE.Vector3(0.004, -0.015, -0.048),
      ],
      (t) => 0.0155 * (1 - t * 0.16),
      26,
      12,
    ),
  );
  heartGroup.add(new THREE.Mesh(aorticArchGeo, heartMat));

  // Supra-Aortic Arch Branches (Brachiocephalic, Left Common Carotid, Left Subclavian)
  const supraBranches: THREE.Vector3[][] = [
    [
      new THREE.Vector3(-0.011, 0.095, 0.004),
      new THREE.Vector3(-0.022, 0.132, 0.008),
    ],
    [
      new THREE.Vector3(0.001, 0.102, -0.01),
      new THREE.Vector3(0.009, 0.138, -0.004),
    ],
    [
      new THREE.Vector3(0.01, 0.096, -0.022),
      new THREE.Vector3(0.028, 0.132, -0.016),
    ],
  ];
  for (const pts of supraBranches) {
    const sbGeo = track(
      createTaperedTube(pts, (t) => THREE.MathUtils.lerp(0.0062, 0.0045, t), 10, 8),
    );
    heartGroup.add(new THREE.Mesh(sbGeo, heartMat));
  }

  // Pulmonary Trunk & Left/Right Pulmonary Bifurcation (cool-blue deoxygenated blood)
  const pulmGeo = track(
    createTaperedTube(
      [
        new THREE.Vector3(0.005, 0.024, 0.03),
        new THREE.Vector3(0.012, 0.066, 0.016),
        new THREE.Vector3(0.052, 0.068, -0.008),
      ],
      (t) => 0.0115 * (1 - t * 0.24),
      16,
      10,
    ),
  );
  heartGroup.add(new THREE.Mesh(pulmGeo, venaMat));

  const rightPulmGeo = track(
    createTaperedTube(
      [
        new THREE.Vector3(0.012, 0.064, 0.014),
        new THREE.Vector3(-0.026, 0.064, -0.004),
        new THREE.Vector3(-0.054, 0.06, -0.01),
      ],
      (t) => THREE.MathUtils.lerp(0.009, 0.0065, t),
      12,
      8,
    ),
  );
  heartGroup.add(new THREE.Mesh(rightPulmGeo, venaMat));

  // Superior Vena Cava
  const svcGeo = track(
    createTaperedTube(
      [
        new THREE.Vector3(-0.036, 0.038, 0.0),
        new THREE.Vector3(-0.036, 0.088, -0.004),
        new THREE.Vector3(-0.028, 0.128, -0.008),
      ],
      () => 0.0115,
      14,
      10,
    ),
  );
  heartGroup.add(new THREE.Mesh(svcGeo, venaMat));

  tagAnatomicalPart(heartGroup, 'heart');
  group.add(heartGroup);

  // 2. Dense, Fine Network of Red Arterial & Blue Venous Blood Vessels
  const treeGroup = new THREE.Group();
  const arteryMat = materials.getCardioMaterial('arterial_tree', false);
  const veinMat = materials.getVenousMaterial('arterial_tree');

  const arterialPaths: { pts: THREE.Vector3[]; r0: number; r1: number }[] = [];
  const venousPaths: { pts: THREE.Vector3[]; r0: number; r1: number }[] = [];

  const hc = heartGroup.position;
  const archTop = new THREE.Vector3(hc.x - 0.002, hc.y + 0.095, hc.z - 0.012);
  const svcTop = new THREE.Vector3(hc.x - 0.028, hc.y + 0.12, hc.z - 0.008);

  // Descending Aorta & Inferior Vena Cava (parallel trunks along anterior spine)
  arterialPaths.push({
    pts: [
      new THREE.Vector3(hc.x + 0.008, hc.y + 0.05, hc.z - 0.038),
      new THREE.Vector3(0.008, 1.25, spineCurveZ(1.25) + 0.028),
      new THREE.Vector3(0.004, 1.14, spineCurveZ(1.14) + 0.028),
      new THREE.Vector3(0.003, 1.02, spineCurveZ(1.02) + 0.026),
    ],
    r0: 0.011,
    r1: 0.0078,
  });

  venousPaths.push({
    pts: [
      new THREE.Vector3(hc.x - 0.026, hc.y - 0.02, hc.z - 0.014),
      new THREE.Vector3(-0.016, 1.22, spineCurveZ(1.22) + 0.026),
      new THREE.Vector3(-0.014, 1.12, spineCurveZ(1.12) + 0.026),
      new THREE.Vector3(-0.012, 1.01, spineCurveZ(1.01) + 0.024),
    ],
    r0: 0.0105,
    r1: 0.0072,
  });

  // Fine Visceral / Mesenteric / Hepatic Vascular Arborization inside Torso & Abdomen
  const visceralOrigins = [
    new THREE.Vector3(0.005, 1.22, 0.006),
    new THREE.Vector3(0.004, 1.17, 0.008),
    new THREE.Vector3(0.003, 1.12, 0.008),
    new THREE.Vector3(0.002, 1.07, 0.008),
  ];
  const visceralTargets = [
    // Right hepatic & subdiaphragmatic twigs
    new THREE.Vector3(-0.088, 1.22, 0.032),
    new THREE.Vector3(-0.068, 1.175, 0.044),
    new THREE.Vector3(-0.095, 1.145, 0.018),
    // Left gastric/splenic & mesenteric twigs
    new THREE.Vector3(0.075, 1.21, 0.022),
    new THREE.Vector3(0.085, 1.16, 0.036),
    new THREE.Vector3(0.056, 1.09, 0.048),
    // Abdominal mesenteric arcade
    new THREE.Vector3(-0.055, 1.045, 0.045),
    new THREE.Vector3(0.048, 1.03, 0.046),
    new THREE.Vector3(-0.035, 0.99, 0.042),
    new THREE.Vector3(0.036, 0.985, 0.042),
  ];
  visceralTargets.forEach((tgt, idx) => {
    const orig = visceralOrigins[idx % visceralOrigins.length];
    const mid = orig.clone().lerp(tgt, 0.55).add(new THREE.Vector3(0, 0.01, 0.012));
    arterialPaths.push({ pts: [orig, mid, tgt], r0: 0.0026, r1: 0.0009 });
    // Paired fine blue portal/mesenteric vein
    venousPaths.push({
      pts: [
        orig.clone().add(new THREE.Vector3(-0.01, -0.004, -0.004)),
        mid.clone().add(new THREE.Vector3(-0.006, -0.004, -0.004)),
        tgt.clone().add(new THREE.Vector3(-0.005, -0.005, -0.004)),
      ],
      r0: 0.0024,
      r1: 0.0009,
    });
  });

  // Bilateral Carotid Arteries & Jugular Veins
  for (const s of [-1, 1] as const) {
    arterialPaths.push({
      pts: [
        archTop.clone(),
        new THREE.Vector3(sideX(s, 0.022), 1.44, 0.024),
        new THREE.Vector3(sideX(s, 0.026), 1.54, 0.016),
        new THREE.Vector3(sideX(s, 0.024), 1.64, 0.012),
        new THREE.Vector3(sideX(s, 0.034), 1.71, 0.024),
      ],
      r0: 0.005,
      r1: 0.0018,
    });

    venousPaths.push({
      pts: [
        svcTop.clone(),
        new THREE.Vector3(sideX(s, 0.034), 1.45, 0.018),
        new THREE.Vector3(sideX(s, 0.036), 1.55, 0.014),
        new THREE.Vector3(sideX(s, 0.034), 1.65, 0.008),
      ],
      r0: 0.0052,
      r1: 0.0018,
    });

    // Cranial & facial branching twigs
    arterialPaths.push({
      pts: [
        new THREE.Vector3(sideX(s, 0.026), 1.55, 0.018),
        new THREE.Vector3(sideX(s, 0.044), 1.60, 0.044),
        new THREE.Vector3(sideX(s, 0.032), 1.66, 0.068),
      ],
      r0: 0.0026,
      r1: 0.001,
    });
  }

  // Bilateral Arm Arteries & Paired Veins (Subclavian -> Brachial -> Radial/Ulnar + Cephalic/Basilic)
  for (const s of [-1, 1] as const) {
    const sh = new THREE.Vector3(sideX(s, LANDMARKS.shoulderX - 0.018), LANDMARKS.shoulderY - 0.012, 0.012);
    const el = new THREE.Vector3(sideX(s, LANDMARKS.elbowX - 0.01), LANDMARKS.elbowY, LANDMARKS.elbowZ + 0.014);
    const wr = new THREE.Vector3(sideX(s, LANDMARKS.wristX), LANDMARKS.wristY, LANDMARKS.wristZ + 0.008);

    arterialPaths.push({
      pts: [
        archTop.clone(),
        new THREE.Vector3(sideX(s, 0.075), 1.44, 0.022),
        new THREE.Vector3(sideX(s, 0.145), 1.43, 0.018),
        sh,
        sh.clone().lerp(el, 0.5).add(new THREE.Vector3(-s * 0.008, 0, 0.008)),
        el,
      ],
      r0: 0.0052,
      r1: 0.003,
    });

    // Cephalic Vein (lateral superficial arm vein)
    venousPaths.push({
      pts: [
        svcTop.clone(),
        new THREE.Vector3(sideX(s, 0.085), 1.445, 0.026),
        sh.clone().add(new THREE.Vector3(s * 0.016, 0.006, 0.014)),
        sh.clone().lerp(el, 0.5).add(new THREE.Vector3(s * 0.022, 0, 0.014)),
        el.clone().add(new THREE.Vector3(s * 0.02, 0, 0.008)),
        el.clone().lerp(wr, 0.5).add(new THREE.Vector3(s * 0.02, 0, 0.008)),
        wr.clone().add(new THREE.Vector3(s * 0.018, 0, 0.006)),
      ],
      r0: 0.0044,
      r1: 0.0018,
    });

    // Basilic Vein (medial arm vein)
    venousPaths.push({
      pts: [
        sh.clone().add(new THREE.Vector3(-s * 0.014, -0.02, 0.004)),
        sh.clone().lerp(el, 0.5).add(new THREE.Vector3(-s * 0.018, 0, 0.004)),
        el.clone().add(new THREE.Vector3(-s * 0.016, 0, 0.004)),
        el.clone().lerp(wr, 0.5).add(new THREE.Vector3(-s * 0.018, 0, 0.004)),
        wr.clone().add(new THREE.Vector3(-s * 0.016, 0, 0.004)),
      ],
      r0: 0.0036,
      r1: 0.0015,
    });

    // Radial & Ulnar Arteries + Fine Forearm Interosseous Branches
    arterialPaths.push({
      pts: [
        el,
        el.clone().lerp(wr, 0.5).add(new THREE.Vector3(s * 0.014, 0, 0.008)),
        wr.clone().add(new THREE.Vector3(s * 0.014, 0, 0.004)),
        wr.clone().add(new THREE.Vector3(s * 0.01, -0.055, 0.008)),
      ],
      r0: 0.0028,
      r1: 0.0014,
    });

    arterialPaths.push({
      pts: [
        el,
        el.clone().lerp(wr, 0.5).add(new THREE.Vector3(-s * 0.012, 0, 0.006)),
        wr.clone().add(new THREE.Vector3(-s * 0.012, 0, 0.004)),
        wr.clone().add(new THREE.Vector3(s * 0.004, -0.06, 0.008)),
      ],
      r0: 0.0028,
      r1: 0.0014,
    });

    // Digital arteries & veins into fingers
    for (const dOff of [-0.016, 0.0, 0.016]) {
      arterialPaths.push({
        pts: [
          wr.clone().add(new THREE.Vector3(s * 0.005, -0.045, 0.008)),
          wr.clone().add(new THREE.Vector3(s * (0.008 + dOff), -0.1, 0.012)),
          wr.clone().add(new THREE.Vector3(s * (0.01 + dOff * 1.4), -0.15, 0.016)),
        ],
        r0: 0.0013,
        r1: 0.0008,
      });
    }
  }

  // Bilateral Renal Vessels
  for (const s of [-1, 1] as const) {
    const rY = s === -1 ? 1.135 : 1.152;
    arterialPaths.push({
      pts: [
        new THREE.Vector3(0.002, rY, spineCurveZ(rY) + 0.024),
        new THREE.Vector3(sideX(s, 0.032), rY, -0.004),
        new THREE.Vector3(sideX(s, 0.054), rY, -0.024),
      ],
      r0: 0.0036,
      r1: 0.0016,
    });
    venousPaths.push({
      pts: [
        new THREE.Vector3(-0.012, rY - 0.006, spineCurveZ(rY) + 0.024),
        new THREE.Vector3(sideX(s, 0.032), rY - 0.006, -0.004),
        new THREE.Vector3(sideX(s, 0.054), rY - 0.006, -0.024),
      ],
      r0: 0.0036,
      r1: 0.0016,
    });
  }

  // Bilateral Lower Limb Dense Vascular Network (Femoral, Profunda, Saphenous Vein, Tibial Branches)
  const aortaSplit = new THREE.Vector3(0.003, 1.02, spineCurveZ(1.02) + 0.026);
  const ivcSplit = new THREE.Vector3(-0.012, 1.01, spineCurveZ(1.01) + 0.024);

  for (const s of [-1, 1] as const) {
    const femoralTop = new THREE.Vector3(sideX(s, 0.082), 0.90, 0.034);
    const kneeBack = new THREE.Vector3(sideX(s, 0.095), LANDMARKS.kneeY, -0.012);
    const anklePos = new THREE.Vector3(sideX(s, 0.095), LANDMARKS.ankleY, 0.006);

    // Iliac + Femoral + Popliteal Artery
    arterialPaths.push({
      pts: [
        aortaSplit,
        new THREE.Vector3(sideX(s, 0.045), 0.96, 0.016),
        femoralTop,
        femoralTop.clone().lerp(kneeBack, 0.48).add(new THREE.Vector3(-s * 0.012, 0, 0.0)),
        kneeBack,
      ],
      r0: 0.0066,
      r1: 0.0036,
    });

    // Femoral & Great Saphenous Vein (medial thigh & leg)
    venousPaths.push({
      pts: [
        ivcSplit,
        new THREE.Vector3(sideX(s, 0.04), 0.955, 0.014),
        femoralTop.clone().add(new THREE.Vector3(-s * 0.012, -0.005, 0.004)),
        femoralTop.clone().lerp(kneeBack, 0.48).add(new THREE.Vector3(-s * 0.026, 0, 0.014)),
        kneeBack.clone().add(new THREE.Vector3(-s * 0.024, 0, 0.008)),
        kneeBack.clone().lerp(anklePos, 0.5).add(new THREE.Vector3(-s * 0.022, 0, 0.008)),
        anklePos.clone().add(new THREE.Vector3(-s * 0.016, 0.01, 0.008)),
      ],
      r0: 0.0058,
      r1: 0.002,
    });

    // Profunda Femoris + Lateral Thigh Muscular Arterial Branches
    arterialPaths.push({
      pts: [
        femoralTop.clone().add(new THREE.Vector3(0, -0.035, -0.004)),
        femoralTop.clone().lerp(kneeBack, 0.35).add(new THREE.Vector3(s * 0.02, 0, -0.016)),
        femoralTop.clone().lerp(kneeBack, 0.7).add(new THREE.Vector3(s * 0.014, 0, -0.012)),
      ],
      r0: 0.0038,
      r1: 0.0014,
    });

    // Secondary Perforating Thigh Twigs (Red & Blue)
    for (const frac of [0.24, 0.44, 0.64]) {
      const origin = femoralTop.clone().lerp(kneeBack, frac);
      arterialPaths.push({
        pts: [
          origin,
          origin.clone().add(new THREE.Vector3(s * 0.028, -0.03, 0.016)),
          origin.clone().add(new THREE.Vector3(s * 0.036, -0.075, 0.006)),
        ],
        r0: 0.0018,
        r1: 0.0008,
      });
      venousPaths.push({
        pts: [
          origin.clone().add(new THREE.Vector3(-s * 0.014, 0, 0.006)),
          origin.clone().add(new THREE.Vector3(-s * 0.028, -0.035, 0.014)),
          origin.clone().add(new THREE.Vector3(-s * 0.022, -0.08, 0.004)),
        ],
        r0: 0.0017,
        r1: 0.0008,
      });
    }

    // Posterior & Anterior Tibial Arteries -> Foot
    arterialPaths.push({
      pts: [
        kneeBack,
        kneeBack.clone().lerp(anklePos, 0.5).add(new THREE.Vector3(-s * 0.006, 0, -0.016)),
        anklePos.clone().add(new THREE.Vector3(-s * 0.008, 0, -0.008)),
        new THREE.Vector3(anklePos.x - s * 0.004, 0.025, 0.075),
      ],
      r0: 0.0034,
      r1: 0.0014,
    });

    arterialPaths.push({
      pts: [
        kneeBack.clone().add(new THREE.Vector3(0, -0.025, 0)),
        kneeBack.clone().lerp(anklePos, 0.45).add(new THREE.Vector3(s * 0.014, 0, 0.014)),
        anklePos.clone().add(new THREE.Vector3(s * 0.005, 0.005, 0.018)),
        new THREE.Vector3(anklePos.x, 0.02, 0.115),
      ],
      r0: 0.003,
      r1: 0.0012,
    });

    // Lateral Calf Small Saphenous Vein
    venousPaths.push({
      pts: [
        kneeBack.clone().add(new THREE.Vector3(s * 0.012, -0.01, -0.01)),
        kneeBack.clone().lerp(anklePos, 0.5).add(new THREE.Vector3(s * 0.018, 0, -0.014)),
        anklePos.clone().add(new THREE.Vector3(s * 0.016, 0, -0.004)),
      ],
      r0: 0.0028,
      r1: 0.0012,
    });
  }

  const flowCurves: THREE.CatmullRomCurve3[] = [];
  for (const path of arterialPaths) {
    const geo = track(
      createTaperedTube(
        path.pts,
        (t) => THREE.MathUtils.lerp(path.r0, path.r1, t),
        20,
        8,
      ),
    );
    treeGroup.add(new THREE.Mesh(geo, arteryMat));
    if (path.r0 >= 0.003) {
      flowCurves.push(new THREE.CatmullRomCurve3(path.pts));
    }
  }

  for (const path of venousPaths) {
    const geo = track(
      createTaperedTube(
        path.pts,
        (t) => THREE.MathUtils.lerp(path.r0, path.r1, t),
        18,
        8,
      ),
    );
    treeGroup.add(new THREE.Mesh(geo, veinMat));
  }

  tagAnatomicalPart(treeGroup, 'arterial_tree');
  group.add(treeGroup);

  // 3. Subtle Animated Arterial Flow Micro-Pulses
  const corpuscleCount = 72;
  const corpuscleGeo = track(new THREE.SphereGeometry(0.0032, 7, 6));
  const corpuscleMesh = new THREE.InstancedMesh(
    corpuscleGeo,
    materials.getCorpuscleMaterial(),
    corpuscleCount,
  );
  corpuscleMesh.frustumCulled = false;

  const phases = new Float32Array(corpuscleCount);
  const curveIndices = new Uint16Array(corpuscleCount);
  const speeds = new Float32Array(corpuscleCount);
  for (let i = 0; i < corpuscleCount; i++) {
    phases[i] = (i * 0.371) % 1;
    curveIndices[i] = i % flowCurves.length;
    speeds[i] = 0.24 + (i % 5) * 0.035;
  }
  group.add(corpuscleMesh);

  return {
    group,
    heartGroup,
    corpuscles: {
      mesh: corpuscleMesh,
      curves: flowCurves,
      phases,
      curveIndices,
      speeds,
    },
    geometries,
  };
}
