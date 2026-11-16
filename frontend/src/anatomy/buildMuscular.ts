import * as THREE from 'three';
import type { MaterialRegistry } from './materials';
import { LANDMARKS, sideX } from './proportions';
import {
  createTaperedTube,
  muscleBellyProfile,
  tagAnatomicalPart,
} from './geometryUtils';

export function buildMuscularSystem(materials: MaterialRegistry): {
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
} {
  const group = new THREE.Group();
  group.name = 'system_muscular';
  const geometries: THREE.BufferGeometry[] = [];
  const track = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };

  // 1. Pectorals, Deltoids, Neck & Upper Back
  const pecDeltGroup = new THREE.Group();
  const pecMat = materials.getMuscleMaterial('pectorals_deltoids');

  for (const s of [-1, 1] as const) {
    // Pectoralis Major fan (multiple layered fiber bundles)
    const pecOrigins = [
      new THREE.Vector3(sideX(s, 0.022), 1.41, 0.088),
      new THREE.Vector3(sideX(s, 0.022), 1.355, 0.102),
      new THREE.Vector3(sideX(s, 0.028), 1.30, 0.104),
    ];
    const pecInsert = new THREE.Vector3(
      sideX(s, LANDMARKS.shoulderX - 0.015),
      1.375,
      0.032,
    );
    pecOrigins.forEach((orig, idx) => {
      const mid = orig.clone().lerp(pecInsert, 0.5);
      mid.z += 0.022 - idx * 0.004;
      const geo = track(
        createTaperedTube(
          [orig, mid, pecInsert],
          muscleBellyProfile(0.026 - idx * 0.003, 0.42),
          16,
          10,
        ),
      );
      const mesh = new THREE.Mesh(geo, pecMat);
      mesh.scale.set(1, 1.15, 0.62);
      pecDeltGroup.add(mesh);
    });

    // Deltoid shoulder cap (anterior, lateral, posterior heads)
    const shPos = new THREE.Vector3(
      sideX(s, LANDMARKS.shoulderX),
      LANDMARKS.shoulderY,
      0,
    );
    const deltInsert = new THREE.Vector3(
      sideX(s, LANDMARKS.shoulderX + 0.022),
      1.305,
      0.002,
    );
    for (const zOff of [-0.028, 0.0, 0.028]) {
      const top = shPos.clone().add(new THREE.Vector3(-s * 0.014, 0.018, zOff * 0.9));
      const mid = top.clone().lerp(deltInsert, 0.44);
      mid.x += s * 0.024;
      mid.z += zOff * 0.65;
      const geo = track(
        createTaperedTube(
          [top, mid, deltInsert],
          muscleBellyProfile(0.023, 0.36),
          14,
          10,
        ),
      );
      pecDeltGroup.add(new THREE.Mesh(geo, pecMat));
    }

    // Sternocleidomastoid (neck V-strap)
    const scmGeo = track(
      createTaperedTube(
        [
          new THREE.Vector3(sideX(s, 0.015), 1.445, 0.075),
          new THREE.Vector3(sideX(s, 0.034), 1.52, 0.032),
          new THREE.Vector3(sideX(s, 0.056), 1.59, -0.018),
        ],
        muscleBellyProfile(0.013, 0.5),
        14,
        8,
      ),
    );
    pecDeltGroup.add(new THREE.Mesh(scmGeo, pecMat));

    // Trapezius upper fibers
    const trapGeo = track(
      createTaperedTube(
        [
          new THREE.Vector3(sideX(s, 0.016), 1.57, -0.052),
          new THREE.Vector3(sideX(s, 0.075), 1.495, -0.048),
          new THREE.Vector3(sideX(s, LANDMARKS.shoulderX - 0.015), 1.455, -0.012),
        ],
        muscleBellyProfile(0.022, 0.45),
        14,
        9,
      ),
    );
    pecDeltGroup.add(new THREE.Mesh(trapGeo, pecMat));

    // Latissimus dorsi (posterior lateral wing)
    const latGeo = track(
      createTaperedTube(
        [
          new THREE.Vector3(sideX(s, 0.028), 1.06, -0.075),
          new THREE.Vector3(sideX(s, 0.115), 1.23, -0.072),
          new THREE.Vector3(sideX(s, LANDMARKS.shoulderX - 0.022), 1.37, -0.012),
        ],
        muscleBellyProfile(0.034, 0.52),
        16,
        10,
      ),
    );
    const latMesh = new THREE.Mesh(latGeo, pecMat);
    latMesh.scale.set(1.0, 1.0, 0.52);
    pecDeltGroup.add(latMesh);
  }
  tagAnatomicalPart(pecDeltGroup, 'pectorals_deltoids');
  group.add(pecDeltGroup);

  // 2. Abdominals & Obliques
  const absGroup = new THREE.Group();
  const absMat = materials.getMuscleMaterial('abdominals_obliques');

  for (const s of [-1, 1] as const) {
    // Segmented rectus abdominis (4 pairs of tendinous bellies)
    const segments = [
      [1.235, 1.18, 0.095],
      [1.175, 1.12, 0.094],
      [1.115, 1.06, 0.092],
      [1.055, 0.96, 0.082],
    ];
    segments.forEach(([yTop, yBot, zFront]) => {
      const geo = track(
        createTaperedTube(
          [
            new THREE.Vector3(sideX(s, 0.034), yTop, zFront - 0.008),
            new THREE.Vector3(sideX(s, 0.032), (yTop + yBot) * 0.5, zFront),
            new THREE.Vector3(sideX(s, 0.028), yBot, zFront - 0.008),
          ],
          muscleBellyProfile(0.024, 0.5),
          10,
          9,
        ),
      );
      const m = new THREE.Mesh(geo, absMat);
      m.scale.set(1.1, 1.0, 0.55);
      absGroup.add(m);
    });

    // External Oblique flank sheets
    const oblGeo = track(
      createTaperedTube(
        [
          new THREE.Vector3(sideX(s, 0.135), 1.24, 0.012),
          new THREE.Vector3(sideX(s, 0.128), 1.11, 0.038),
          new THREE.Vector3(sideX(s, 0.118), 0.97, 0.028),
        ],
        muscleBellyProfile(0.032, 0.5),
        16,
        10,
      ),
    );
    const obl = new THREE.Mesh(oblGeo, absMat);
    obl.scale.set(0.62, 1.0, 1.28);
    absGroup.add(obl);
  }
  tagAnatomicalPart(absGroup, 'abdominals_obliques');
  group.add(absGroup);

  // 3. Arm Musculature (Biceps, Triceps, Forearm flexors/extensors)
  const armGroup = new THREE.Group();
  const armMat = materials.getMuscleMaterial('arm_muscles');

  for (const s of [-1, 1] as const) {
    const sh = new THREE.Vector3(sideX(s, LANDMARKS.shoulderX), LANDMARKS.shoulderY - 0.03, 0);
    const el = new THREE.Vector3(sideX(s, LANDMARKS.elbowX), LANDMARKS.elbowY, LANDMARKS.elbowZ);
    const wr = new THREE.Vector3(sideX(s, LANDMARKS.wristX), LANDMARKS.wristY, LANDMARKS.wristZ);

    // Biceps brachii (anterior)
    const bicepsGeo = track(
      createTaperedTube(
        [
          sh.clone().add(new THREE.Vector3(-s * 0.006, -0.02, 0.018)),
          sh.clone().lerp(el, 0.5).add(new THREE.Vector3(0, 0, 0.028)),
          el.clone().add(new THREE.Vector3(0, 0.012, 0.016)),
        ],
        muscleBellyProfile(0.028, 0.52),
        16,
        10,
      ),
    );
    armGroup.add(new THREE.Mesh(bicepsGeo, armMat));

    // Triceps brachii (posterior)
    const tricepsGeo = track(
      createTaperedTube(
        [
          sh.clone().add(new THREE.Vector3(-s * 0.008, -0.025, -0.02)),
          sh.clone().lerp(el, 0.42).add(new THREE.Vector3(0, 0, -0.028)),
          el.clone().add(new THREE.Vector3(0, 0.01, -0.018)),
        ],
        muscleBellyProfile(0.031, 0.4),
        16,
        10,
      ),
    );
    armGroup.add(new THREE.Mesh(tricepsGeo, armMat));

    // Brachioradialis & Forearm flexors (thick proximally, tapering to wrist tendons)
    const foreFrontGeo = track(
      createTaperedTube(
        [
          el.clone().add(new THREE.Vector3(-s * 0.008, -0.012, 0.014)),
          el.clone().lerp(wr, 0.34).add(new THREE.Vector3(0, 0, 0.02)),
          wr.clone().add(new THREE.Vector3(0, 0.015, 0.008)),
        ],
        muscleBellyProfile(0.026, 0.3),
        16,
        10,
      ),
    );
    armGroup.add(new THREE.Mesh(foreFrontGeo, armMat));

    const foreLatGeo = track(
      createTaperedTube(
        [
          el.clone().add(new THREE.Vector3(s * 0.016, 0.008, 0.0)),
          el.clone().lerp(wr, 0.36).add(new THREE.Vector3(s * 0.018, 0, -0.006)),
          wr.clone().add(new THREE.Vector3(s * 0.01, 0.015, 0)),
        ],
        muscleBellyProfile(0.021, 0.28),
        14,
        9,
      ),
    );
    armGroup.add(new THREE.Mesh(foreLatGeo, armMat));
  }
  tagAnatomicalPart(armGroup, 'arm_muscles');
  group.add(armGroup);

  // 4. Leg Musculature (Gluteals, Quadriceps, Hamstrings, Calves)
  const legGroup = new THREE.Group();
  const legMat = materials.getMuscleMaterial('leg_muscles');

  for (const s of [-1, 1] as const) {
    const hip = new THREE.Vector3(sideX(s, LANDMARKS.hipOffsetX), LANDMARKS.hipY, 0);
    const knee = new THREE.Vector3(sideX(s, LANDMARKS.kneeOffsetX), LANDMARKS.kneeY, 0.008);
    const ankle = new THREE.Vector3(sideX(s, LANDMARKS.ankleOffsetX), LANDMARKS.ankleY, -0.005);

    // Gluteus maximus
    const glutGeo = track(
      createTaperedTube(
        [
          new THREE.Vector3(sideX(s, 0.032), 0.96, -0.078),
          new THREE.Vector3(sideX(s, 0.095), 0.90, -0.098),
          new THREE.Vector3(sideX(s, 0.132), 0.83, -0.045),
        ],
        muscleBellyProfile(0.052, 0.48),
        14,
        12,
      ),
    );
    const glut = new THREE.Mesh(glutGeo, legMat);
    glut.scale.set(1.0, 1.0, 0.72);
    legGroup.add(glut);

    // Rectus femoris (central anterior thigh)
    const rectFemGeo = track(
      createTaperedTube(
        [
          hip.clone().add(new THREE.Vector3(0, 0.025, 0.042)),
          hip.clone().lerp(knee, 0.46).add(new THREE.Vector3(0, 0, 0.054)),
          knee.clone().add(new THREE.Vector3(0, 0.025, 0.032)),
        ],
        muscleBellyProfile(0.038, 0.44),
        18,
        12,
      ),
    );
    legGroup.add(new THREE.Mesh(rectFemGeo, legMat));

    // Vastus lateralis (outer thigh sweep)
    const vastLatGeo = track(
      createTaperedTube(
        [
          hip.clone().add(new THREE.Vector3(s * 0.046, 0.0, 0.01)),
          hip.clone().lerp(knee, 0.48).add(new THREE.Vector3(s * 0.048, 0, 0.026)),
          knee.clone().add(new THREE.Vector3(s * 0.026, 0.025, 0.02)),
        ],
        muscleBellyProfile(0.036, 0.45),
        18,
        10,
      ),
    );
    legGroup.add(new THREE.Mesh(vastLatGeo, legMat));

    // Vastus medialis (teardrop inner knee)
    const vastMedGeo = track(
      createTaperedTube(
        [
          hip.clone().add(new THREE.Vector3(-s * 0.026, -0.03, 0.015)),
          hip.clone().lerp(knee, 0.62).add(new THREE.Vector3(-s * 0.034, 0, 0.028)),
          knee.clone().add(new THREE.Vector3(-s * 0.024, 0.02, 0.02)),
        ],
        muscleBellyProfile(0.032, 0.66),
        18,
        10,
      ),
    );
    legGroup.add(new THREE.Mesh(vastMedGeo, legMat));

    // Hamstrings (posterior thigh)
    const hamGeo = track(
      createTaperedTube(
        [
          hip.clone().add(new THREE.Vector3(0, -0.02, -0.045)),
          hip.clone().lerp(knee, 0.46).add(new THREE.Vector3(0, 0, -0.048)),
          knee.clone().add(new THREE.Vector3(0, 0.01, -0.026)),
        ],
        muscleBellyProfile(0.042, 0.45),
        16,
        10,
      ),
    );
    legGroup.add(new THREE.Mesh(hamGeo, legMat));

    // Gastrocnemius (calf muscle heads)
    for (const headOffset of [-0.016, 0.016]) {
      const calfGeo = track(
        createTaperedTube(
          [
            knee.clone().add(new THREE.Vector3(headOffset, -0.01, -0.022)),
            knee.clone().lerp(ankle, 0.32).add(new THREE.Vector3(headOffset * 1.1, 0, -0.046)),
            ankle.clone().add(new THREE.Vector3(0, 0.04, -0.024)),
          ],
          muscleBellyProfile(0.027, 0.34),
          16,
          10,
        ),
      );
      legGroup.add(new THREE.Mesh(calfGeo, legMat));
    }

    // Tibialis anterior (shin)
    const tibAntGeo = track(
      createTaperedTube(
        [
          knee.clone().add(new THREE.Vector3(s * 0.016, -0.03, 0.018)),
          knee.clone().lerp(ankle, 0.38).add(new THREE.Vector3(s * 0.018, 0, 0.024)),
          ankle.clone().add(new THREE.Vector3(-s * 0.008, 0.02, 0.018)),
        ],
        muscleBellyProfile(0.021, 0.34),
        14,
        9,
      ),
    );
    legGroup.add(new THREE.Mesh(tibAntGeo, legMat));
  }
  tagAnatomicalPart(legGroup, 'leg_muscles');
  group.add(legGroup);

  return { group, geometries };
}
