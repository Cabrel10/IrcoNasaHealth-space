import * as THREE from 'three';

/**
 * Generates a variable-radius tube along a 3D Catmull-Rom spline with smooth UVs
 * (u = normalized progress along spline 0..1, ideal for arterial/nerve pulse shaders).
 */
export function createTaperedTube(
  points: THREE.Vector3[],
  radiusFn: (t: number) => number,
  tubularSegments = 32,
  radialSegments = 12,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(tubularSegments, false);

  const vertexCount = (tubularSegments + 1) * (radialSegments + 1);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices: number[] = [];

  const P = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const vertex = new THREE.Vector3();

  let vIdx = 0;
  let uvIdx = 0;

  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    curve.getPointAt(t, P);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const r = Math.max(0.0008, radiusFn(t));

    for (let j = 0; j <= radialSegments; j++) {
      const v = (j / radialSegments) * Math.PI * 2;
      const sin = Math.sin(v);
      const cos = -Math.cos(v);

      normal.x = cos * N.x + sin * B.x;
      normal.y = cos * N.y + sin * B.y;
      normal.z = cos * N.z + sin * B.z;
      normal.normalize();

      vertex.x = P.x + r * normal.x;
      vertex.y = P.y + r * normal.y;
      vertex.z = P.z + r * normal.z;

      positions[vIdx] = vertex.x;
      positions[vIdx + 1] = vertex.y;
      positions[vIdx + 2] = vertex.z;

      normals[vIdx] = normal.x;
      normals[vIdx + 1] = normal.y;
      normals[vIdx + 2] = normal.z;

      uvs[uvIdx] = t;
      uvs[uvIdx + 1] = j / radialSegments;

      vIdx += 3;
      uvIdx += 2;
    }
  }

  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = (radialSegments + 1) * i + j;
      const b = (radialSegments + 1) * (i + 1) + j;
      const c = (radialSegments + 1) * (i + 1) + (j + 1);
      const d = (radialSegments + 1) * i + (j + 1);

      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geometry;
}

/**
 * Generates an anatomical long-bone radius profile (flared proximal/distal epiphyses + slender diaphysis).
 */
export function longBoneProfile(
  shaftRadius: number,
  proximalFlare = 1.75,
  distalFlare = 1.65,
): (t: number) => number {
  return (t: number) => {
    const prox = Math.exp(-Math.pow(t / 0.13, 2)) * (proximalFlare - 1);
    const dist = Math.exp(-Math.pow((1 - t) / 0.13, 2)) * (distalFlare - 1);
    // Taper to closed-ish cap at extreme tips
    const cap = Math.sin(Math.min(1, t * 14) * (Math.PI / 2)) * Math.sin(Math.min(1, (1 - t) * 14) * (Math.PI / 2));
    return shaftRadius * (1 + prox + dist) * (0.35 + 0.65 * cap);
  };
}

/**
 * Generates a fusiform muscle belly profile (tapered tendons at ends, thick belly in middle).
 */
export function muscleBellyProfile(
  peakRadius: number,
  peakPosition = 0.48,
): (t: number) => number {
  return (t: number) => {
    const shifted = THREE.MathUtils.clamp(
      t < peakPosition ? t / peakPosition : (1 - t) / (1 - peakPosition),
      0,
      1,
    );
    return peakRadius * (0.18 + 0.82 * Math.pow(Math.sin((shifted * Math.PI) / 2), 0.85));
  };
}

/**
 * Recursively tags meshes with `userData.partId` and enables Raycaster layer 1.
 */
export function tagAnatomicalPart(object: THREE.Object3D, partId: string): void {
  object.traverse((child) => {
    child.userData.partId = partId;
    if ((child as THREE.Mesh).isMesh) {
      child.layers.enable(1);
    }
  });
}
