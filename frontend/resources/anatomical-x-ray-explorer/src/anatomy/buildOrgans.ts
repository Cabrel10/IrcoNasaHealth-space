import * as THREE from 'three';
import { MaterialRegistry } from './materials';
import { LANDMARKS, sideX, spineCurveZ } from './proportions';
import { createTaperedTube, tagAnatomicalPart } from './geometryUtils';

export function buildOrgansSystem(materials: MaterialRegistry): {
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
} {
  const group = new THREE.Group();
  group.name = 'system_organs';
  const geometries: THREE.BufferGeometry[] = [];
  const track = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };

  // 1. Detailed Sculpted Brain (Cerebral Hemispheres + Temporal Lobes + Cerebellum + Brainstem)
  const brainGroup = new THREE.Group();
  const brainMat = materials.getOrganMaterial('brain_spinal_cord', 'brain');

  for (const s of [-1, 1] as const) {
    const hemiGeo = track(new THREE.SphereGeometry(0.062, 28, 22));
    const attr = hemiGeo.attributes.position;
    for (let i = 0; i < attr.count; i++) {
      let x = attr.getX(i) * 0.68;
      let y = attr.getY(i) * 0.86;
      let z = attr.getZ(i) * 1.24;
      // Flatten longitudinal fissure
      if (s * x < 0) x *= 0.22;
      // Subtle temporal lobe bulge laterally & inferiorly
      if (y < 0.0 && z > -0.02 && z < 0.04) {
        x += s * 0.008;
        y -= 0.006;
      }
      // Slight cortical gyral undulation
      const gyri =
        Math.sin(x * 180 + z * 120) * Math.cos(y * 160 + z * 100) * 0.0022;
      x += Math.sign(x || s) * gyri;
      y += gyri;
      attr.setXYZ(i, x, y, z);
    }
    hemiGeo.computeVertexNormals();
    const hemi = new THREE.Mesh(hemiGeo, brainMat);
    hemi.position.set(sideX(s, 0.023), LANDMARKS.headCenterY + 0.042, -0.005);
    brainGroup.add(hemi);

    // Cerebellum with horizontal folia ridges
    const cerebGeo = track(new THREE.SphereGeometry(0.028, 20, 16));
    const cAttr = cerebGeo.attributes.position;
    for (let i = 0; i < cAttr.count; i++) {
      const cy = cAttr.getY(i);
      const folia = Math.sin(cy * 420) * 0.0014;
      cAttr.setX(i, cAttr.getX(i) * 0.96 + folia);
      cAttr.setZ(i, cAttr.getZ(i) * 0.86 + folia);
      cAttr.setY(i, cy * 0.72);
    }
    cerebGeo.computeVertexNormals();
    const cereb = new THREE.Mesh(cerebGeo, brainMat);
    cereb.position.set(sideX(s, 0.021), LANDMARKS.headCenterY - 0.006, -0.048);
    brainGroup.add(cereb);
  }

  // Pons & Medulla Brainstem
  const stemGeo = track(
    createTaperedTube(
      [
        new THREE.Vector3(0, LANDMARKS.headCenterY + 0.015, -0.012),
        new THREE.Vector3(0, LANDMARKS.headCenterY - 0.015, -0.014),
        new THREE.Vector3(0, 1.59, spineCurveZ(1.58) - 0.005),
      ],
      (t) => (t > 0.25 && t < 0.6 ? 0.014 : 0.0095),
      14,
      10,
    ),
  );
  brainGroup.add(new THREE.Mesh(stemGeo, brainMat));

  tagAnatomicalPart(brainGroup, 'brain_spinal_cord');
  group.add(brainGroup);

  // 2. Lungs & Tracheobronchial Tree
  const lungsGroup = new THREE.Group();
  const lungMat = materials.getOrganMaterial('lungs', 'lungs');
  const bronchiMat = materials.getOrganMaterial('lungs', 'bronchi');

  // Trachea & Carina
  const tracheaGeo = track(
    createTaperedTube(
      [
        new THREE.Vector3(0, 1.50, 0.016),
        new THREE.Vector3(0, 1.44, 0.012),
        new THREE.Vector3(0, 1.385, 0.005),
      ],
      (t) => 0.009 + Math.sin(t * 50) * 0.0009,
      20,
      12,
    ),
  );
  lungsGroup.add(new THREE.Mesh(tracheaGeo, bronchiMat));

  // Mainstem & Lobar Bronchi branching inside each lung
  const carina = new THREE.Vector3(0, 1.385, 0.005);
  for (const s of [-1, 1] as const) {
    const hilum = new THREE.Vector3(sideX(s, 0.056), 1.355, 0.002);
    const mainBronchGeo = track(
      createTaperedTube(
        [carina, hilum],
        (t) => THREE.MathUtils.lerp(0.0075, 0.0052, t),
        10,
        9,
      ),
    );
    lungsGroup.add(new THREE.Mesh(mainBronchGeo, bronchiMat));

    const branchTargets = [
      new THREE.Vector3(sideX(s, 0.088), 1.40, 0.005),
      new THREE.Vector3(sideX(s, 0.095), 1.33, 0.012),
      new THREE.Vector3(sideX(s, 0.088), 1.27, -0.008),
    ];
    branchTargets.forEach((tgt) => {
      const bGeo = track(
        createTaperedTube(
          [hilum, hilum.clone().lerp(tgt, 0.55).add(new THREE.Vector3(0, 0, 0.006)), tgt],
          (t) => THREE.MathUtils.lerp(0.0046, 0.0018, t),
          10,
          7,
        ),
      );
      lungsGroup.add(new THREE.Mesh(bGeo, bronchiMat));
    });
  }

  // Right Lung (-X, 3 lobes, shorter base above liver) & Left Lung (+X, cardiac notch)
  for (const s of [-1, 1] as const) {
    const lungGeo = track(new THREE.SphereGeometry(0.082, 26, 22));
    const attr = lungGeo.attributes.position;
    for (let i = 0; i < attr.count; i++) {
      let x = attr.getX(i);
      let y = attr.getY(i);
      let z = attr.getZ(i);

      // Conical pulmonary profile: narrow apex, broad diaphragmatic base
      const yNorm = THREE.MathUtils.clamp((y + 0.082) / 0.164, 0, 1); // 0 bottom, 1 top
      const taper = THREE.MathUtils.lerp(1.06, 0.42, Math.pow(yNorm, 1.35));
      x *= 0.68 * taper;
      z *= 0.92 * taper;
      y *= s === -1 ? 1.18 : 1.24; // Right lung slightly higher base for liver

      // Flatten medial mediastinal surface
      if (s * x < 0) {
        x *= 0.38;
      }

      // Concave diaphragmatic base
      if (y < -0.06) {
        y += 0.022 * (1 - Math.abs(x) / 0.06);
      }

      // Prominent Cardiac Notch on anatomical left lung (+X) around heart
      if (s === 1 && x < 0.015 && y < 0.015 && y > -0.075 && z > -0.02) {
        x += 0.026 * Math.exp(-Math.pow((y + 0.035) / 0.04, 2));
      }

      // Anatomical interlobar fissures (oblique on both; horizontal on right lung -X)
      const obliqueDist = Math.abs(y - (-0.015 + z * 0.38));
      if (obliqueDist < 0.01) {
        const crease = 0.0045 * Math.cos((obliqueDist / 0.01) * (Math.PI / 2));
        x -= Math.sign(x || s) * crease;
        z -= Math.sign(z || 1) * crease * 0.5;
      }
      if (s === -1 && z > 0.0) {
        const horizDist = Math.abs(y - 0.016);
        if (horizDist < 0.008) {
          const creaseH = 0.004 * Math.cos((horizDist / 0.008) * (Math.PI / 2));
          x -= Math.sign(x || s) * creaseH;
        }
      }

      attr.setXYZ(i, x, y, z);
    }
    lungGeo.computeVertexNormals();
    const lungMesh = new THREE.Mesh(lungGeo, lungMat);
    lungMesh.position.set(
      sideX(s, 0.078),
      s === -1 ? 1.335 : 1.328,
      0.008,
    );
    lungMesh.renderOrder = 3;
    lungsGroup.add(lungMesh);
  }

  tagAnatomicalPart(lungsGroup, 'lungs');
  group.add(lungsGroup);

  // 3. Liver (Right Upper Abdomen = -X anatomical right, tucked beneath right ribs/diaphragm)
  const liverGroup = new THREE.Group();
  const liverMat = materials.getOrganMaterial('liver', 'liver');

  const liverGeo = track(new THREE.SphereGeometry(0.068, 24, 18));
  const lAttr = liverGeo.attributes.position;
  for (let i = 0; i < lAttr.count; i++) {
    let x = lAttr.getX(i);
    let y = lAttr.getY(i);
    let z = lAttr.getZ(i);

    // Broad right lobe (-X), tapering sharply across midline toward left lobe (+X)
    x *= 1.22;
    const xNorm = THREE.MathUtils.clamp((x + 0.083) / 0.166, 0, 1); // 0 = far right (-X), 1 = left tip (+X)
    const wedge = THREE.MathUtils.lerp(1.18, 0.34, Math.pow(xNorm, 1.1));
    y *= 0.72 * wedge;
    z *= 0.88 * THREE.MathUtils.lerp(1.08, 0.52, xNorm);

    // Slanted inferior visceral margin (higher on left, lower on right)
    if (y < 0) {
      y += xNorm * 0.028;
    }

    // Falciform ligament fissure separating right & left hepatic lobes
    if (z > 0.0 && Math.abs(x - 0.012) < 0.012) {
      z -= 0.006 * Math.cos(((x - 0.012) / 0.012) * (Math.PI / 2));
    }

    lAttr.setXYZ(i, x, y, z);
  }
  liverGeo.computeVertexNormals();
  const liverMesh = new THREE.Mesh(liverGeo, liverMat);
  liverMesh.position.set(-0.046, 1.195, 0.028);
  liverMesh.rotation.z = 0.14;
  liverGroup.add(liverMesh);

  // Gallbladder pear tucked beneath inferior right hepatic border
  const gbGeo = track(new THREE.SphereGeometry(0.011, 14, 12));
  gbGeo.scale(0.85, 1.55, 0.85);
  const gbMesh = new THREE.Mesh(gbGeo, materials.getOrganMaterial('liver', 'bronchi'));
  gbMesh.position.set(-0.042, 1.158, 0.048);
  gbMesh.rotation.z = -0.35;
  gbMesh.rotation.x = 0.25;
  liverGroup.add(gbMesh);

  tagAnatomicalPart(liverGroup, 'liver');
  group.add(liverGroup);

  // 4. Kidneys, Adrenal Caps & Ureters (Retroperitoneal lumbar region)
  const kidneysGroup = new THREE.Group();
  const kidneyMat = materials.getOrganMaterial('kidneys', 'kidneys');

  for (const s of [-1, 1] as const) {
    const kGeo = track(new THREE.SphereGeometry(0.03, 20, 16));
    const kAttr = kGeo.attributes.position;
    for (let i = 0; i < kAttr.count; i++) {
      let x = kAttr.getX(i) * 0.78;
      let y = kAttr.getY(i) * 1.52;
      let z = kAttr.getZ(i) * 0.58;
      // Bean-shaped medial hilum indentation
      if (s * x < 0 && Math.abs(y) < 0.024) {
        x += s * 0.009 * Math.cos((y / 0.024) * (Math.PI / 2));
      }
      kAttr.setXYZ(i, x, y, z);
    }
    kGeo.computeVertexNormals();
    const kMesh = new THREE.Mesh(kGeo, kidneyMat);
    const kY = s === -1 ? 1.132 : 1.152; // Right kidney slightly lower under liver
    kMesh.position.set(sideX(s, 0.058), kY, -0.026);
    kMesh.rotation.z = s * -0.14;
    kMesh.rotation.y = s * -0.22;
    kidneysGroup.add(kMesh);

    // Suprarenal (adrenal) cap
    const adrGeo = track(new THREE.ConeGeometry(0.013, 0.015, 10));
    adrGeo.scale(1.1, 0.85, 0.7);
    const adrMesh = new THREE.Mesh(adrGeo, kidneyMat);
    adrMesh.position.set(sideX(s, 0.052), kY + 0.044, -0.024);
    adrMesh.rotation.z = s * 0.25;
    kidneysGroup.add(adrMesh);

    // Ureter descending to pelvic bladder plane
    const ureterGeo = track(
      createTaperedTube(
        [
          new THREE.Vector3(sideX(s, 0.042), kY - 0.005, -0.022),
          new THREE.Vector3(sideX(s, 0.036), 1.03, -0.01),
          new THREE.Vector3(sideX(s, 0.022), 0.94, 0.022),
        ],
        () => 0.0028,
        14,
        7,
      ),
    );
    kidneysGroup.add(new THREE.Mesh(ureterGeo, kidneyMat));
  }

  tagAnatomicalPart(kidneysGroup, 'kidneys');
  group.add(kidneysGroup);

  // 5. Intestines (Large Colon Frame + Coiled Small Intestine)
  const intestinesGroup = new THREE.Group();
  const colonMat = materials.getOrganMaterial('intestines', 'intestines_colon');
  const smallMat = materials.getOrganMaterial('intestines', 'intestines_small');

  // Colon: Cecum (-X) -> Ascending (-X) -> Transverse -> Descending (+X) -> Sigmoid
  const colonPts = [
    new THREE.Vector3(-0.072, 0.975, 0.024), // Cecum
    new THREE.Vector3(-0.078, 1.045, 0.022), // Ascending colon
    new THREE.Vector3(-0.074, 1.125, 0.026), // Hepatic flexure
    new THREE.Vector3(-0.028, 1.115, 0.055), // Transverse right
    new THREE.Vector3(0.026, 1.12, 0.056),   // Transverse left
    new THREE.Vector3(0.076, 1.135, 0.024),  // Splenic flexure
    new THREE.Vector3(0.078, 1.04, 0.018),   // Descending colon
    new THREE.Vector3(0.068, 0.965, 0.022),  // Iliac colon
    new THREE.Vector3(0.022, 0.942, 0.015),  // Sigmoid
    new THREE.Vector3(0.0, 0.905, -0.01),    // Rectum
  ];
  const colonGeo = track(
    createTaperedTube(
      colonPts,
      (t) => 0.0155 + Math.sin(t * 72) * 0.0025, // Haustra ripples
      64,
      12,
    ),
  );
  intestinesGroup.add(new THREE.Mesh(colonGeo, colonMat));

  // Small Intestine Coils (Jejunum & Ileum)
  const smallPts = [
    new THREE.Vector3(0.036, 1.095, 0.026),
    new THREE.Vector3(-0.032, 1.092, 0.038),
    new THREE.Vector3(-0.052, 1.066, 0.044),
    new THREE.Vector3(0.012, 1.058, 0.052),
    new THREE.Vector3(0.052, 1.046, 0.034),
    new THREE.Vector3(-0.018, 1.03, 0.054),
    new THREE.Vector3(-0.054, 1.012, 0.038),
    new THREE.Vector3(0.024, 1.005, 0.05),
    new THREE.Vector3(0.048, 0.988, 0.036),
    new THREE.Vector3(-0.022, 0.978, 0.046),
    new THREE.Vector3(-0.058, 0.975, 0.028),
  ];
  const smallGeo = track(
    createTaperedTube(
      smallPts,
      (t) => 0.0105 + Math.sin(t * 48) * 0.0012,
      72,
      10,
    ),
  );
  intestinesGroup.add(new THREE.Mesh(smallGeo, smallMat));

  tagAnatomicalPart(intestinesGroup, 'intestines');
  group.add(intestinesGroup);

  return { group, geometries };
}
