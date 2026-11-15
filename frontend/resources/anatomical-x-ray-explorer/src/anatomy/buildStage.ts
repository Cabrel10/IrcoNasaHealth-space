import * as THREE from 'three';
import {
  createContactShadowTexture,
  createRadarStageTexture,
} from './materials';

export function buildDiagnosticStage(maxAnisotropy: number): {
  group: THREE.Group;
  update: (elapsed: number) => void;
  dispose: () => void;
} {
  const group = new THREE.Group();
  group.name = 'diagnostic_stage';

  const radarTex = createRadarStageTexture(maxAnisotropy);
  const contactTex = createContactShadowTexture(maxAnisotropy);

  // 1. Floor concentric radar & coordinate grid disc (y = 0)
  const floorGeo = new THREE.PlaneGeometry(5.6, 5.6);
  const floorMat = new THREE.MeshBasicMaterial({
    map: radarTex,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = 0.0;
  group.add(floorMesh);

  // 2. Soft radial contact shadow directly beneath feet (y = 0.005)
  const contactGeo = new THREE.PlaneGeometry(1.1, 1.1);
  const contactMat = new THREE.MeshBasicMaterial({
    map: contactTex,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const contactMesh = new THREE.Mesh(contactGeo, contactMat);
  contactMesh.rotation.x = -Math.PI / 2;
  contactMesh.position.y = 0.005;
  group.add(contactMesh);

  // 3. Subtle vertical concentric radar rings behind the figure (z = -0.95)
  const backdropGeo = new THREE.PlaneGeometry(3.8, 3.8);
  const backdropMat = new THREE.MeshBasicMaterial({
    map: radarTex,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const backdropMesh = new THREE.Mesh(backdropGeo, backdropMat);
  backdropMesh.position.set(0, 1.05, -0.95);
  group.add(backdropMesh);

  // 4. Overhead Volumetric Blue Spotlight Beam Cone (focused on body, zero glare)
  const beamGeo = new THREE.CylinderGeometry(0.24, 0.84, 2.75, 40, 1, true);
  const beamMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0x38bdf8) },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.1);
        float verticalFade = smoothstep(0.0, 0.28, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
        float alpha = edge * verticalFade * 0.036;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const beamMesh = new THREE.Mesh(beamGeo, beamMat);
  beamMesh.position.set(0, 1.38, 0.0);
  beamMesh.renderOrder = 2;
  group.add(beamMesh);

  // 5. Slow-rotating subtle outer diagnostic calibration ring on floor
  const outerRingGeo = new THREE.RingGeometry(0.92, 0.932, 96);
  const outerRingMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
  outerRing.rotation.x = -Math.PI / 2;
  outerRing.position.y = 0.01;
  group.add(outerRing);

  const update = (elapsed: number) => {
    outerRing.rotation.z = elapsed * 0.08;
    backdropMesh.rotation.z = -elapsed * 0.025;
  };

  const dispose = () => {
    floorGeo.dispose();
    floorMat.dispose();
    contactGeo.dispose();
    contactMat.dispose();
    backdropGeo.dispose();
    backdropMat.dispose();
    beamGeo.dispose();
    beamMat.dispose();
    outerRingGeo.dispose();
    outerRingMat.dispose();
    radarTex.dispose();
    contactTex.dispose();
  };

  return { group, update, dispose };
}
