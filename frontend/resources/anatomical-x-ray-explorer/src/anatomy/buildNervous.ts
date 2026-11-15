import * as THREE from 'three';
import { MaterialRegistry } from './materials';
import { LANDMARKS, sideX, spineCurveZ } from './proportions';
import { createTaperedTube, tagAnatomicalPart } from './geometryUtils';

export function buildNervousSystem(materials: MaterialRegistry): {
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
} {
  const group = new THREE.Group();
  group.name = 'system_nervous';
  const geometries: THREE.BufferGeometry[] = [];
  const track = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };

  // 1. Central Nervous System: Brain & Spinal Cord
  const cnsGroup = new THREE.Group();
  const cnsMat = materials.getNerveMaterial('brain_spinal_cord', true);

  // Deep White-Matter Cerebral Tracts (nested inside cortical brain)
  for (const s of [-1, 1] as const) {
    const hemiGeo = track(new THREE.SphereGeometry(0.042, 18, 14));
    const attr = hemiGeo.attributes.position;
    for (let i = 0; i < attr.count; i++) {
      let x = attr.getX(i) * 0.68;
      let y = attr.getY(i) * 0.85;
      let z = attr.getZ(i) * 1.22;
      if (s * x < 0) x *= 0.25;
      attr.setXYZ(i, x, y, z);
    }
    hemiGeo.computeVertexNormals();
    const hemi = new THREE.Mesh(hemiGeo, cnsMat);
    hemi.position.set(sideX(s, 0.021), LANDMARKS.headCenterY + 0.042, -0.005);
    cnsGroup.add(hemi);

    // Cerebellar arbor core
    const cerebGeo = track(new THREE.SphereGeometry(0.018, 12, 10));
    const cereb = new THREE.Mesh(cerebGeo, cnsMat);
    cereb.scale.set(0.95, 0.72, 0.85);
    cereb.position.set(sideX(s, 0.02), LANDMARKS.headCenterY - 0.006, -0.048);
    cnsGroup.add(cereb);
  }

  // Brainstem -> Spinal Cord descending inside vertebral canal to L2 + Cauda Equina
  const cordPoints: THREE.Vector3[] = [
    new THREE.Vector3(0, LANDMARKS.headCenterY + 0.005, -0.014),
    new THREE.Vector3(0, 1.59, spineCurveZ(1.58) - 0.006),
  ];
  for (let i = 0; i <= 14; i++) {
    const y = THREE.MathUtils.lerp(1.56, 0.94, i / 14);
    cordPoints.push(new THREE.Vector3(0, y, spineCurveZ(y) - 0.006));
  }
  const cordGeo = track(
    createTaperedTube(
      cordPoints,
      (t) => (t < 0.12 ? 0.011 : 0.0058 - t * 0.0024),
      44,
      10,
    ),
  );
  cnsGroup.add(new THREE.Mesh(cordGeo, cnsMat));
  tagAnatomicalPart(cnsGroup, 'brain_spinal_cord');
  group.add(cnsGroup);

  // 2. Peripheral Nervous System (Brachial, Intercostal, Sciatic & Tibial Nerves)
  const pnsGroup = new THREE.Group();
  const pnsMat = materials.getNerveMaterial('peripheral_nerves', false);

  const nervePaths: { pts: THREE.Vector3[]; r0: number; r1: number }[] = [];
  const synapsePoints: THREE.Vector3[] = [];

  // Cervical & Brachial Plexus -> Radial, Median, Ulnar Nerves down Arms
  for (const s of [-1, 1] as const) {
    const plexusCenter = new THREE.Vector3(sideX(s, 0.068), 1.46, 0.005);
    synapsePoints.push(plexusCenter);

    const sh = new THREE.Vector3(sideX(s, LANDMARKS.shoulderX - 0.01), LANDMARKS.shoulderY - 0.015, -0.004);
    const el = new THREE.Vector3(sideX(s, LANDMARKS.elbowX), LANDMARKS.elbowY, LANDMARKS.elbowZ);
    const wr = new THREE.Vector3(sideX(s, LANDMARKS.wristX), LANDMARKS.wristY, LANDMARKS.wristZ);

    // Cervical roots C5-T1 feeding brachial plexus
    for (const rootY of [1.51, 1.48, 1.445]) {
      nervePaths.push({
        pts: [
          new THREE.Vector3(0, rootY, spineCurveZ(rootY) - 0.006),
          new THREE.Vector3(sideX(s, 0.036), rootY - 0.012, 0.0),
          plexusCenter,
        ],
        r0: 0.0022,
        r1: 0.002,
      });
    }

    // Median Nerve (central anterior arm -> palm -> index/middle digits)
    nervePaths.push({
      pts: [
        plexusCenter,
        sh,
        sh.clone().lerp(el, 0.5).add(new THREE.Vector3(-s * 0.006, 0, 0.008)),
        el.clone().add(new THREE.Vector3(0, 0, 0.01)),
        el.clone().lerp(wr, 0.5).add(new THREE.Vector3(0, 0, 0.01)),
        wr.clone().add(new THREE.Vector3(0, 0, 0.006)),
        wr.clone().add(new THREE.Vector3(s * 0.008, -0.135, 0.015)),
      ],
      r0: 0.0028,
      r1: 0.001,
    });

    // Ulnar Nerve (medial elbow -> medial palm -> ring/pinky)
    nervePaths.push({
      pts: [
        plexusCenter,
        sh.clone().add(new THREE.Vector3(-s * 0.01, -0.01, -0.01)),
        el.clone().add(new THREE.Vector3(-s * 0.018, 0, -0.008)),
        el.clone().lerp(wr, 0.5).add(new THREE.Vector3(-s * 0.015, 0, 0)),
        wr.clone().add(new THREE.Vector3(-s * 0.014, 0, 0.004)),
        wr.clone().add(new THREE.Vector3(-s * 0.016, -0.12, 0.012)),
      ],
      r0: 0.0024,
      r1: 0.0009,
    });

    // Radial Nerve (spirals laterally -> thumb/dorsal hand)
    nervePaths.push({
      pts: [
        plexusCenter,
        sh.clone().add(new THREE.Vector3(0, -0.02, -0.016)),
        sh.clone().lerp(el, 0.55).add(new THREE.Vector3(s * 0.016, 0, -0.014)),
        el.clone().add(new THREE.Vector3(s * 0.018, 0, 0.0)),
        el.clone().lerp(wr, 0.5).add(new THREE.Vector3(s * 0.018, 0, 0.004)),
        wr.clone().add(new THREE.Vector3(s * 0.026, -0.085, 0.012)),
      ],
      r0: 0.0024,
      r1: 0.0009,
    });

    // Thoracic Intercostal Nerves (T2–T10 tracing along ribs)
    for (let r = 0; r < 6; r++) {
      const y = THREE.MathUtils.lerp(1.40, 1.22, r / 5);
      const zBack = spineCurveZ(y) - 0.006;
      const w = 0.095 + Math.sin((r / 5) * Math.PI * 0.8) * 0.052;
      nervePaths.push({
        pts: [
          new THREE.Vector3(0, y, zBack),
          new THREE.Vector3(sideX(s, w * 0.6), y - 0.008, zBack - 0.022),
          new THREE.Vector3(sideX(s, w), y - 0.024, 0.01),
          new THREE.Vector3(sideX(s, w * 0.65), y - 0.042, 0.072),
        ],
        r0: 0.0017,
        r1: 0.0008,
      });
    }

    // Lumbosacral Plexus -> Sciatic Nerve -> Tibial & Common Fibular Nerves
    const lumbPlexus = new THREE.Vector3(sideX(s, 0.044), 0.96, -0.036);
    synapsePoints.push(lumbPlexus);

    for (const rootY of [1.04, 1.0, 0.955]) {
      nervePaths.push({
        pts: [
          new THREE.Vector3(0, rootY, spineCurveZ(rootY) - 0.006),
          lumbPlexus,
        ],
        r0: 0.0024,
        r1: 0.0022,
      });
    }

    const hipBack = new THREE.Vector3(sideX(s, 0.088), 0.89, -0.036);
    const kneeBack = new THREE.Vector3(sideX(s, LANDMARKS.kneeOffsetX), LANDMARKS.kneeY, -0.018);
    const anklePos = new THREE.Vector3(sideX(s, LANDMARKS.ankleOffsetX), LANDMARKS.ankleY, -0.006);

    // Sciatic -> Tibial Nerve
    nervePaths.push({
      pts: [
        lumbPlexus,
        hipBack,
        hipBack.clone().lerp(kneeBack, 0.5).add(new THREE.Vector3(0, 0, -0.01)),
        kneeBack,
        kneeBack.clone().lerp(anklePos, 0.5).add(new THREE.Vector3(-s * 0.005, 0, -0.012)),
        anklePos.clone().add(new THREE.Vector3(-s * 0.008, 0, -0.006)),
        new THREE.Vector3(anklePos.x, 0.022, 0.088),
      ],
      r0: 0.0042,
      r1: 0.0012,
    });

    // Common Fibular / Peroneal branch (lateral leg -> dorsal foot)
    nervePaths.push({
      pts: [
        kneeBack.clone().add(new THREE.Vector3(0, 0.02, 0)),
        kneeBack.clone().add(new THREE.Vector3(s * 0.026, -0.025, 0.0)),
        kneeBack.clone().lerp(anklePos, 0.5).add(new THREE.Vector3(s * 0.02, 0, 0.014)),
        anklePos.clone().add(new THREE.Vector3(s * 0.008, 0.01, 0.02)),
        new THREE.Vector3(anklePos.x + s * 0.005, 0.022, 0.11),
      ],
      r0: 0.0024,
      r1: 0.001,
    });

    // Femoral Nerve (anterior thigh)
    nervePaths.push({
      pts: [
        new THREE.Vector3(0, 1.06, spineCurveZ(1.06) - 0.006),
        new THREE.Vector3(sideX(s, 0.068), 0.94, 0.022),
        new THREE.Vector3(sideX(s, 0.095), 0.72, 0.036),
        new THREE.Vector3(sideX(s, 0.092), 0.54, 0.024),
      ],
      r0: 0.0026,
      r1: 0.0011,
    });
  }

  for (const path of nervePaths) {
    const geo = track(
      createTaperedTube(
        path.pts,
        (t) => THREE.MathUtils.lerp(path.r0, path.r1, t),
        22,
        7,
      ),
    );
    pnsGroup.add(new THREE.Mesh(geo, pnsMat));
  }

  // Synaptic Ganglia / Plexus Nodes (InstancedMesh)
  const nodePositions: THREE.Vector3[] = [...synapsePoints];
  for (let i = 0; i <= 12; i++) {
    const y = THREE.MathUtils.lerp(1.54, 0.96, i / 12);
    nodePositions.push(new THREE.Vector3(0, y, spineCurveZ(y) - 0.006));
  }
  const nodeGeo = track(new THREE.SphereGeometry(0.007, 10, 8));
  const nodeInst = new THREE.InstancedMesh(
    nodeGeo,
    materials.getNodeMaterial(),
    nodePositions.length,
  );
  const dummy = new THREE.Object3D();
  nodePositions.forEach((p, idx) => {
    dummy.position.copy(p);
    dummy.scale.setScalar(idx < synapsePoints.length ? 1.35 : 0.9);
    dummy.updateMatrix();
    nodeInst.setMatrixAt(idx, dummy.matrix);
  });
  nodeInst.computeBoundingSphere();
  pnsGroup.add(nodeInst);

  tagAnatomicalPart(pnsGroup, 'peripheral_nerves');
  group.add(pnsGroup);

  return { group, geometries };
}
