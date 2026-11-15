import * as THREE from 'three';
import { MaterialRegistry } from './materials';
import { LANDMARKS, sideX, spineCurveZ } from './proportions';
import {
  createTaperedTube,
  longBoneProfile,
  tagAnatomicalPart,
} from './geometryUtils';

export function buildSkeletalSystem(materials: MaterialRegistry): {
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
} {
  const group = new THREE.Group();
  group.name = 'system_skeletal';
  const geometries: THREE.BufferGeometry[] = [];
  const track = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };

  // 1. Skull & Mandible
  const skullGroup = new THREE.Group();
  const skullMat = materials.getSkeletalMaterial('skull', 1.0);

  const craniumGeo = track(new THREE.SphereGeometry(0.088, 28, 24));
  const posAttr = craniumGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    let x = posAttr.getX(i);
    let y = posAttr.getY(i);
    let z = posAttr.getZ(i);
    // Elongate anteroposteriorly, narrow temples, flatten inferior base
    z *= 1.18;
    x *= 0.88;
    if (y > 0) y *= 1.06;
    if (y < -0.03) y *= 0.75;
    if (z > 0.03 && y < 0.01) {
      // Maxilla projection
      z += 0.016;
    }
    posAttr.setXYZ(i, x, y, z);
  }
  craniumGeo.computeVertexNormals();
  const craniumMesh = new THREE.Mesh(craniumGeo, skullMat);
  craniumMesh.position.set(0, LANDMARKS.headCenterY + 0.025, -0.008);
  skullGroup.add(craniumMesh);

  // Orbital rims & zygomatic arches
  const orbitGeo = track(new THREE.TorusGeometry(0.017, 0.0045, 10, 20));
  for (const s of [-1, 1] as const) {
    const orbit = new THREE.Mesh(orbitGeo, skullMat);
    orbit.position.set(sideX(s, 0.03), LANDMARKS.headCenterY + 0.008, 0.082);
    orbit.rotation.y = s * 0.18;
    skullGroup.add(orbit);

    const zygomaGeo = track(
      createTaperedTube(
        [
          new THREE.Vector3(sideX(s, 0.044), LANDMARKS.headCenterY - 0.005, 0.072),
          new THREE.Vector3(sideX(s, 0.066), LANDMARKS.headCenterY - 0.007, 0.032),
          new THREE.Vector3(sideX(s, 0.064), LANDMARKS.headCenterY - 0.002, -0.006),
        ],
        () => 0.0055,
        12,
        8,
      ),
    );
    skullGroup.add(new THREE.Mesh(zygomaGeo, skullMat));
  }

  // Nasal bridge
  const nasalGeo = track(new THREE.ConeGeometry(0.011, 0.034, 6));
  const nasal = new THREE.Mesh(nasalGeo, skullMat);
  nasal.position.set(0, LANDMARKS.headCenterY - 0.002, 0.095);
  nasal.rotation.x = 0.42;
  skullGroup.add(nasal);

  // Mandible horseshoe U-arch
  const mandibleGeo = track(
    createTaperedTube(
      [
        new THREE.Vector3(-0.052, LANDMARKS.headCenterY - 0.015, 0.015),
        new THREE.Vector3(-0.048, LANDMARKS.jawY + 0.01, 0.042),
        new THREE.Vector3(-0.026, LANDMARKS.jawY - 0.004, 0.082),
        new THREE.Vector3(0, LANDMARKS.jawY - 0.008, 0.094),
        new THREE.Vector3(0.026, LANDMARKS.jawY - 0.004, 0.082),
        new THREE.Vector3(0.048, LANDMARKS.jawY + 0.01, 0.042),
        new THREE.Vector3(0.052, LANDMARKS.headCenterY - 0.015, 0.015),
      ],
      (t) => 0.0085 + 0.003 * Math.sin(t * Math.PI),
      28,
      10,
    ),
  );
  skullGroup.add(new THREE.Mesh(mandibleGeo, skullMat));

  // Maxillary & mandibular dental arcade hint
  const teethGeo = track(
    new THREE.TorusGeometry(0.024, 0.0045, 8, 16, Math.PI * 0.9),
  );
  const upperTeeth = new THREE.Mesh(teethGeo, skullMat);
  upperTeeth.rotation.x = Math.PI / 2;
  upperTeeth.rotation.z = Math.PI * 0.05;
  upperTeeth.position.set(0, LANDMARKS.jawY + 0.018, 0.064);
  skullGroup.add(upperTeeth);

  tagAnatomicalPart(skullGroup, 'skull');
  group.add(skullGroup);

  // 2. Vertebral Column & Sacrum (Instanced vertebrae + discs + sacrum)
  const spineGroup = new THREE.Group();
  const spineMat = materials.getSkeletalMaterial('spine', 1.05);
  const discMat = materials.getSkeletalMaterial('spine', 0.55);

  const vertCount = 24;
  const vertBodyGeo = track(new THREE.CylinderGeometry(0.018, 0.019, 0.018, 16));
  const vertInst = new THREE.InstancedMesh(vertBodyGeo, spineMat, vertCount);

  const processGeo = track(new THREE.BoxGeometry(0.008, 0.011, 0.026));
  const processInst = new THREE.InstancedMesh(processGeo, spineMat, vertCount);

  const transverseGeo = track(new THREE.BoxGeometry(0.052, 0.006, 0.008));
  const transverseInst = new THREE.InstancedMesh(transverseGeo, spineMat, vertCount);

  const discGeo = track(new THREE.CylinderGeometry(0.017, 0.017, 0.0065, 14));
  const discInst = new THREE.InstancedMesh(discGeo, discMat, vertCount - 1);

  const dummy = new THREE.Object3D();
  for (let i = 0; i < vertCount; i++) {
    const t = i / (vertCount - 1); // 0 = L5, 1 = C1
    const y = THREE.MathUtils.lerp(0.96, 1.56, t);
    const z = spineCurveZ(y);
    const scale = THREE.MathUtils.lerp(1.22, 0.62, t);

    dummy.position.set(0, y, z);
    dummy.rotation.set(Math.cos(t * Math.PI * 2) * 0.08, 0, 0);
    dummy.scale.set(scale, 1.0 - t * 0.2, scale);
    dummy.updateMatrix();
    vertInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(0, y - 0.002, z - 0.024 * scale);
    dummy.rotation.set(-0.32, 0, 0);
    dummy.scale.set(scale, 1, scale);
    dummy.updateMatrix();
    processInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(0, y, z - 0.01 * scale);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(scale, 1, scale);
    dummy.updateMatrix();
    transverseInst.setMatrixAt(i, dummy.matrix);

    if (i < vertCount - 1) {
      const ny = THREE.MathUtils.lerp(0.96, 1.56, (i + 0.5) / (vertCount - 1));
      dummy.position.set(0, ny, spineCurveZ(ny));
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(scale * 0.96, 1, scale * 0.96);
      dummy.updateMatrix();
      discInst.setMatrixAt(i, dummy.matrix);
    }
  }
  vertInst.computeBoundingSphere();
  processInst.computeBoundingSphere();
  transverseInst.computeBoundingSphere();
  discInst.computeBoundingSphere();
  spineGroup.add(vertInst, processInst, transverseInst, discInst);

  // Sacrum & coccyx wedge
  const sacrumGeo = track(new THREE.ConeGeometry(0.052, 0.11, 6));
  const sacrum = new THREE.Mesh(sacrumGeo, spineMat);
  sacrum.scale.set(1.0, 1.0, 0.42);
  sacrum.rotation.x = Math.PI + 0.25;
  sacrum.position.set(0, 0.895, -0.055);
  spineGroup.add(sacrum);

  tagAnatomicalPart(spineGroup, 'spine');
  group.add(spineGroup);

  // 3. Ribcage & Sternum
  const ribGroup = new THREE.Group();
  const ribMat = materials.getSkeletalMaterial('ribcage', 0.95);

  // Sternum (Manubrium + Body + Xiphoid)
  const sternumGeo = track(
    createTaperedTube(
      [
        new THREE.Vector3(0, 1.435, 0.082),
        new THREE.Vector3(0, 1.38, 0.098),
        new THREE.Vector3(0, 1.29, 0.105),
        new THREE.Vector3(0, 1.24, 0.098),
      ],
      (t) => (t < 0.25 ? 0.022 : t > 0.85 ? 0.008 : 0.015),
      18,
      10,
    ),
  );
  const sternum = new THREE.Mesh(sternumGeo, ribMat);
  sternum.scale.set(1.2, 1, 0.36);
  ribGroup.add(sternum);

  // 12 pairs of anatomically curved ribs
  for (let r = 0; r < 12; r++) {
    const t = r / 11; // 0 = Rib 1 (top), 1 = Rib 12 (bottom floating)
    const backY = THREE.MathUtils.lerp(1.44, 1.15, t);
    const backZ = spineCurveZ(backY);
    const frontY = backY - THREE.MathUtils.lerp(0.025, 0.075, t);
    const widthX = 0.088 + Math.sin(t * Math.PI * 0.82) * 0.072;
    const depthFrontZ = 0.078 + Math.sin(t * Math.PI * 0.7) * 0.028;
    const isFloating = r >= 10;
    const isFalseRib = r >= 7 && r < 10;

    for (const s of [-1, 1] as const) {
      const pts: THREE.Vector3[] = [
        new THREE.Vector3(sideX(s, 0.018), backY, backZ - 0.004),
        new THREE.Vector3(sideX(s, widthX * 0.62), backY - 0.008, backZ - 0.036),
        new THREE.Vector3(sideX(s, widthX), (backY + frontY) * 0.5, 0.005),
      ];

      if (!isFloating) {
        pts.push(
          new THREE.Vector3(sideX(s, widthX * 0.72), frontY + 0.004, depthFrontZ * 0.86),
        );
        if (isFalseRib) {
          // Sweep up toward costal margin
          pts.push(new THREE.Vector3(sideX(s, 0.045 + (r - 7) * 0.022), 1.235, 0.092));
        } else {
          // Attach to sternum
          const sternY = THREE.MathUtils.lerp(1.42, 1.255, r / 6);
          pts.push(new THREE.Vector3(sideX(s, 0.02), sternY, 0.095));
        }
      } else {
        pts.push(new THREE.Vector3(sideX(s, widthX * 0.82), frontY, -0.005));
      }

      const ribGeo = track(
        createTaperedTube(
          pts,
          (u) => 0.0062 - 0.0014 * u,
          24,
          8,
        ),
      );
      const ribMesh = new THREE.Mesh(ribGeo, ribMat);
      ribGroup.add(ribMesh);
    }
  }
  tagAnatomicalPart(ribGroup, 'ribcage');
  group.add(ribGroup);

  // 4. Clavicles & Scapulae
  const girdleGroup = new THREE.Group();
  const girdleMat = materials.getSkeletalMaterial('clavicle_scapula', 1.0);
  for (const s of [-1, 1] as const) {
    // S-curved clavicle
    const clavGeo = track(
      createTaperedTube(
        [
          new THREE.Vector3(sideX(s, 0.02), 1.44, 0.08),
          new THREE.Vector3(sideX(s, 0.08), 1.455, 0.072),
          new THREE.Vector3(sideX(s, 0.145), 1.455, 0.028),
          new THREE.Vector3(sideX(s, LANDMARKS.shoulderX - 0.01), LANDMARKS.shoulderY + 0.018, 0.002),
        ],
        longBoneProfile(0.0075, 1.4, 1.35),
        20,
        10,
      ),
    );
    girdleGroup.add(new THREE.Mesh(clavGeo, girdleMat));

    // Scapula triangular wing on posterior thorax
    const scapShape = new THREE.Shape();
    scapShape.moveTo(0, 0);
    scapShape.lineTo(0.088, 0.035);
    scapShape.lineTo(0.065, -0.115);
    scapShape.lineTo(0, 0);
    const scapGeo = track(
      new THREE.ExtrudeGeometry(scapShape, {
        depth: 0.008,
        bevelEnabled: true,
        bevelThickness: 0.003,
        bevelSize: 0.003,
        bevelSegments: 2,
      }),
    );
    const scap = new THREE.Mesh(scapGeo, girdleMat);
    scap.position.set(sideX(s, 0.055), 1.40, -0.082);
    if (s === -1) {
      scap.scale.x = -1;
    }
    scap.rotation.y = s * -0.28;
    scap.rotation.x = 0.14;
    girdleGroup.add(scap);
  }
  tagAnatomicalPart(girdleGroup, 'clavicle_scapula');
  group.add(girdleGroup);

  // 5. Pelvis (Iliac wings, pubic symphysis, ischial rami)
  const pelvisGroup = new THREE.Group();
  const pelvisMat = materials.getSkeletalMaterial('pelvis', 1.0);

  const iliumShape = new THREE.Shape();
  iliumShape.moveTo(0.025, -0.025);
  iliumShape.bezierCurveTo(0.05, 0.06, 0.125, 0.095, 0.142, 0.042);
  iliumShape.bezierCurveTo(0.15, -0.005, 0.115, -0.05, 0.095, -0.075);
  iliumShape.bezierCurveTo(0.075, -0.105, 0.03, -0.095, 0.015, -0.065);
  iliumShape.closePath();

  const iliumGeo = track(
    new THREE.ExtrudeGeometry(iliumShape, {
      depth: 0.014,
      bevelEnabled: true,
      bevelThickness: 0.005,
      bevelSize: 0.005,
      bevelSegments: 3,
    }),
  );

  for (const s of [-1, 1] as const) {
    const ilium = new THREE.Mesh(iliumGeo, pelvisMat);
    ilium.position.set(0, LANDMARKS.pelvisCenterY + 0.01, -0.01);
    ilium.scale.x = s;
    ilium.rotation.y = s * -0.45;
    ilium.rotation.x = -0.18;
    pelvisGroup.add(ilium);
  }

  // Pubic arch connecting left & right
  const pubisGeo = track(
    createTaperedTube(
      [
        new THREE.Vector3(-0.095, LANDMARKS.hipY, 0.01),
        new THREE.Vector3(-0.045, LANDMARKS.hipY - 0.032, 0.055),
        new THREE.Vector3(0, LANDMARKS.hipY - 0.036, 0.064),
        new THREE.Vector3(0.045, LANDMARKS.hipY - 0.032, 0.055),
        new THREE.Vector3(0.095, LANDMARKS.hipY, 0.01),
      ],
      (t) => 0.011 + 0.003 * Math.cos((t - 0.5) * Math.PI * 2),
      20,
      10,
    ),
  );
  pelvisGroup.add(new THREE.Mesh(pubisGeo, pelvisMat));
  tagAnatomicalPart(pelvisGroup, 'pelvis');
  group.add(pelvisGroup);

  // 6. Upper Limb Bones (Humerus, Radius, Ulna, Hand)
  const upperGroup = new THREE.Group();
  const upperMat = materials.getSkeletalMaterial('upper_limb_bones', 1.0);
  const jointSphereGeo = track(new THREE.SphereGeometry(0.022, 14, 12));

  for (const s of [-1, 1] as const) {
    const shoulder = new THREE.Vector3(sideX(s, LANDMARKS.shoulderX), LANDMARKS.shoulderY, 0.0);
    const elbow = new THREE.Vector3(sideX(s, LANDMARKS.elbowX), LANDMARKS.elbowY, LANDMARKS.elbowZ);
    const wrist = new THREE.Vector3(sideX(s, LANDMARKS.wristX), LANDMARKS.wristY, LANDMARKS.wristZ);

    // Humeral head
    const hHead = new THREE.Mesh(jointSphereGeo, upperMat);
    hHead.position.copy(shoulder);
    upperGroup.add(hHead);

    // Humerus shaft
    const humerusGeo = track(
      createTaperedTube(
        [shoulder, shoulder.clone().lerp(elbow, 0.5), elbow],
        longBoneProfile(0.013, 1.55, 1.55),
        20,
        12,
      ),
    );
    upperGroup.add(new THREE.Mesh(humerusGeo, upperMat));

    // Supinated anatomical forearm: Radius is lateral (+sideX), Ulna is medial (-sideX)
    const dirVec = wrist.clone().sub(elbow).normalize();
    const lateralOffset = new THREE.Vector3(s * 0.013, 0, 0.004);
    const medialOffset = new THREE.Vector3(-s * 0.012, 0, -0.004);

    const radiusGeo = track(
      createTaperedTube(
        [
          elbow.clone().add(lateralOffset).addScaledVector(dirVec, 0.008),
          elbow.clone().lerp(wrist, 0.5).addScaledVector(lateralOffset, 1.15),
          wrist.clone().add(lateralOffset),
        ],
        longBoneProfile(0.0082, 1.35, 1.65),
        18,
        10,
      ),
    );
    upperGroup.add(new THREE.Mesh(radiusGeo, upperMat));

    const ulnaGeo = track(
      createTaperedTube(
        [
          elbow.clone().add(medialOffset),
          elbow.clone().lerp(wrist, 0.5).addScaledVector(medialOffset, 1.05),
          wrist.clone().add(medialOffset),
        ],
        longBoneProfile(0.008, 1.6, 1.25),
        18,
        10,
      ),
    );
    upperGroup.add(new THREE.Mesh(ulnaGeo, upperMat));

    // Hand (Carpal block + 5 metacarpals/phalanges fanned in open palm facing +Z)
    const carpalGeo = track(new THREE.BoxGeometry(0.044, 0.022, 0.016));
    const carpal = new THREE.Mesh(carpalGeo, upperMat);
    carpal.position.copy(wrist).add(new THREE.Vector3(s * 0.004, -0.014, 0.003));
    carpal.rotation.z = s * 0.2;
    upperGroup.add(carpal);

    // 5 fingers (index 0 = thumb lateral, 4 = pinky medial)
    for (let f = 0; f < 5; f++) {
      const spread = (2 - f) * 0.011;
      const isThumb = f === 0;
      const basePos = wrist
        .clone()
        .add(new THREE.Vector3(s * (0.005 + (2 - f) * 0.011), -0.024, 0.004));
      const len = isThumb ? 0.072 : f === 2 ? 0.132 : f === 4 ? 0.104 : 0.122;
      const tipPos = basePos
        .clone()
        .add(
          new THREE.Vector3(
            s * (isThumb ? 0.048 : spread * 2.1 + 0.018),
            -len,
            0.014,
          ),
        );

      const fingerGeo = track(
        createTaperedTube(
          [basePos, basePos.clone().lerp(tipPos, 0.48), tipPos],
          (t) => (isThumb ? 0.0052 : 0.0042) * (1 - t * 0.45),
          12,
          7,
        ),
      );
      upperGroup.add(new THREE.Mesh(fingerGeo, upperMat));
    }
  }
  tagAnatomicalPart(upperGroup, 'upper_limb_bones');
  group.add(upperGroup);

  // 7. Lower Limb Bones (Femur, Patella, Tibia, Fibula, Foot)
  const lowerGroup = new THREE.Group();
  const lowerMat = materials.getSkeletalMaterial('lower_limb_bones', 1.0);
  const femHeadGeo = track(new THREE.SphereGeometry(0.026, 16, 14));
  const patellaGeo = track(new THREE.SphereGeometry(0.019, 12, 10));

  for (const s of [-1, 1] as const) {
    const hipSocket = new THREE.Vector3(sideX(s, LANDMARKS.hipOffsetX), LANDMARKS.hipY, 0.0);
    const trochanter = new THREE.Vector3(sideX(s, LANDMARKS.hipOffsetX + 0.036), LANDMARKS.hipY - 0.02, -0.005);
    const knee = new THREE.Vector3(sideX(s, LANDMARKS.kneeOffsetX), LANDMARKS.kneeY, 0.008);
    const ankle = new THREE.Vector3(sideX(s, LANDMARKS.ankleOffsetX), LANDMARKS.ankleY, -0.005);

    const femHead = new THREE.Mesh(femHeadGeo, lowerMat);
    femHead.position.copy(hipSocket);
    lowerGroup.add(femHead);

    // Femoral neck + shaft
    const femurGeo = track(
      createTaperedTube(
        [
          hipSocket,
          trochanter,
          trochanter.clone().lerp(knee, 0.48).add(new THREE.Vector3(0, 0, 0.014)),
          knee,
        ],
        longBoneProfile(0.018, 1.45, 1.85),
        24,
        12,
      ),
    );
    lowerGroup.add(new THREE.Mesh(femurGeo, lowerMat));

    // Patella
    const patella = new THREE.Mesh(patellaGeo, lowerMat);
    patella.scale.set(1.0, 1.1, 0.55);
    patella.position.copy(knee).add(new THREE.Vector3(0, 0.014, 0.032));
    lowerGroup.add(patella);

    // Tibia (medial weight-bearing)
    const tibiaGeo = track(
      createTaperedTube(
        [
          knee.clone().add(new THREE.Vector3(0, -0.012, 0)),
          knee.clone().lerp(ankle, 0.5).add(new THREE.Vector3(-s * 0.003, 0, 0.005)),
          ankle,
        ],
        longBoneProfile(0.015, 1.9, 1.5),
        22,
        12,
      ),
    );
    lowerGroup.add(new THREE.Mesh(tibiaGeo, lowerMat));

    // Fibula (slender lateral strut)
    const fibulaOffset = new THREE.Vector3(s * 0.022, 0, -0.01);
    const fibulaGeo = track(
      createTaperedTube(
        [
          knee.clone().add(fibulaOffset).add(new THREE.Vector3(0, -0.026, 0)),
          knee.clone().lerp(ankle, 0.5).add(fibulaOffset),
          ankle.clone().add(fibulaOffset),
        ],
        longBoneProfile(0.0068, 1.5, 1.4),
        18,
        8,
      ),
    );
    lowerGroup.add(new THREE.Mesh(fibulaGeo, lowerMat));

    // Tarsal/Calcaneus heel + 5 Metatarsal/Phalanges rays
    const heelGeo = track(new THREE.BoxGeometry(0.036, 0.038, 0.056));
    const heel = new THREE.Mesh(heelGeo, lowerMat);
    heel.position.set(ankle.x, 0.036, -0.024);
    lowerGroup.add(heel);

    for (let toe = 0; toe < 5; toe++) {
      // toe 0 = big toe medial
      const toeX = ankle.x + s * (-0.018 + toe * 0.013);
      const toeLen = 0.145 - toe * 0.009;
      const footRayGeo = track(
        createTaperedTube(
          [
            new THREE.Vector3(toeX, 0.044, -0.005),
            new THREE.Vector3(toeX, 0.024, 0.065),
            new THREE.Vector3(toeX, 0.014, toeLen),
          ],
          (t) => (toe === 0 ? 0.0085 : 0.0055) * (1 - t * 0.35),
          12,
          7,
        ),
      );
      lowerGroup.add(new THREE.Mesh(footRayGeo, lowerMat));
    }
  }
  tagAnatomicalPart(lowerGroup, 'lower_limb_bones');
  group.add(lowerGroup);

  return { group, geometries };
}
