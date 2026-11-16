import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type {
  AnatomicalSystemId,
  CameraPresetId,
  DiagnosticState,
  LayerVisibilityState,
} from '@/anatomy/types';
import { LANDMARKS } from '@/anatomy/proportions';
import { createSystemMaterialRegistry } from '@/anatomy/materials';
import { buildSkeletalSystem } from '@/anatomy/buildSkeletal';
import { buildOrgansSystem } from '@/anatomy/buildOrgans';
import { buildMuscularSystem } from '@/anatomy/buildMuscular';
import { buildCardiovascularSystem } from '@/anatomy/buildCardiovascular';
import { buildNervousSystem } from '@/anatomy/buildNervous';
import {
  buildHolographicSkinSystem,
  buildSilhouetteInsetModel,
} from '@/anatomy/buildHolographicSkin';
import { buildDiagnosticStage } from '@/anatomy/buildStage';
import { buildDiagnosticOverlays } from '@/anatomy/buildDiagnosticOverlays';

interface AnatomyViewportProps {
  layers: LayerVisibilityState;
  heartRateBpm: number | null;
  flowSpeed: number;
  cameraPreset: CameraPresetId;
  presetTrigger: number;
  selectedPartId: string | null;
  diagnostics?: DiagnosticState;
  hideChrome?: boolean;
  onSelectPart: (partId: string | null) => void;
  onHoverPart: (partId: string | null) => void;
  onResetAnterior: () => void;
}

const CAMERA_PRESETS: Record<
  CameraPresetId,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  anterior: { pos: [0, 1.02, 2.55], target: [0, 0.94, 0] },
  thoracic: { pos: [0.18, 1.32, 1.08], target: [0.02, 1.30, 0.02] },
  lateral: { pos: [2.45, 1.04, 0.15], target: [0, 0.94, 0] },
  posterior: { pos: [0, 1.05, -2.55], target: [0, 0.94, 0] },
};

// Pre-allocated scratch math helpers (zero GC inside animation loop)
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _dummy = new THREE.Object3D();

const INSET_W = 118;
const INSET_H = 152;
const INSET_MARGIN = 18;

export function AnatomyViewport({
  layers,
  heartRateBpm,
  flowSpeed,
  cameraPreset,
  presetTrigger,
  selectedPartId,
  diagnostics,
  hideChrome = false,
  onSelectPart,
  onHoverPart,
  onResetAnterior,
}: AnatomyViewportProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  // Mutable refs for 60fps loop without recreating WebGL context
  const layersRef = useRef(layers);
  const bpmRef = useRef(heartRateBpm);
  const flowRef = useRef(flowSpeed);
  const selectedRef = useRef(selectedPartId);
  const diagnosticsRef = useRef(diagnostics);
  const hoveredRef = useRef<string | null>(null);
  const onSelectRef = useRef(onSelectPart);
  const onHoverRef = useRef(onHoverPart);
  const presetTargetRef = useRef<{
    active: boolean;
    pos: THREE.Vector3;
    target: THREE.Vector3;
  }>({
    active: false,
    pos: new THREE.Vector3(...CAMERA_PRESETS.anterior.pos),
    target: new THREE.Vector3(...CAMERA_PRESETS.anterior.target),
  });

  layersRef.current = layers;
  bpmRef.current = heartRateBpm;
  flowRef.current = flowSpeed;
  selectedRef.current = selectedPartId;
  diagnosticsRef.current = diagnostics;
  onSelectRef.current = onSelectPart;
  onHoverRef.current = onHoverPart;

  useEffect(() => {
    const cfg = CAMERA_PRESETS[cameraPreset];
    presetTargetRef.current.pos.set(...cfg.pos);
    presetTargetRef.current.target.set(...cfg.target);
    presetTargetRef.current.active = true;
  }, [cameraPreset, presetTrigger]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Software WebGL Guard
    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 2. Renderer Setup
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.88;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.autoClear = false;

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    // 3. Main Scene, Fog & Studio Environment Map
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1120);
    scene.fog = new THREE.FogExp2(0x0b1120, 0.085);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // 4. Camera & Damped OrbitControls
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.08, 40);
    camera.position.set(...CAMERA_PRESETS.anterior.pos);

    const controls = new OrbitControls(camera, canvas);
    controls.target.set(...CAMERA_PRESETS.anterior.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 0.65;
    controls.maxDistance = 4.5;
    controls.minPolarAngle = 0.18;
    controls.maxPolarAngle = Math.PI * 0.56;
    controls.update();

    const cancelPresetTransition = () => {
      presetTargetRef.current.active = false;
    };
    controls.addEventListener('start', cancelPresetTransition);

    // 5. Clinical Volumetric Lighting Rig (Soft internal glow, zero blinding glare)
    const hemiLight = new THREE.HemisphereLight(0x67e8f9, 0x0b1120, 0.44);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1e6, 0.72);
    keyLight.position.set(2.1, 3.2, 2.5);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x22d3ee, 0.96);
    rimLight.position.set(-1.6, 2.4, -2.4);
    scene.add(rimLight);

    // Focused overhead soft blue spotlight
    const overheadSpot = new THREE.SpotLight(
      0x38bdf8,
      2.8,
      6.5,
      Math.PI / 6.2,
      0.75,
      1.4,
    );
    overheadSpot.position.set(0, 3.3, 0.22);
    overheadSpot.target.position.set(0, 0.95, 0);
    scene.add(overheadSpot.target);
    scene.add(overheadSpot);

    // Calibrated internal cyan core & abdominal organ illumination
    const internalCyanLight = new THREE.PointLight(0x22d3ee, 1.32, 2.1, 1.5);
    internalCyanLight.position.set(0, 1.28, 0.04);
    scene.add(internalCyanLight);

    const internalAbdomenLight = new THREE.PointLight(0x38bdf8, 0.82, 1.4, 1.7);
    internalAbdomenLight.position.set(0, 1.07, 0.02);
    scene.add(internalAbdomenLight);

    // Subtle pulsing red-orange heart inner light (never blinding)
    const heartLight = new THREE.PointLight(0xff5226, 1.25, 1.25, 1.7);
    heartLight.position.copy(LANDMARKS.heartCenter);
    scene.add(heartLight);

    // 6. Build Anatomical Systems & Diagnostic Stage
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const materials = createSystemMaterialRegistry(maxAnisotropy);

    const stage = buildDiagnosticStage(maxAnisotropy);
    scene.add(stage.group);

    const diagnosticOverlays = buildDiagnosticOverlays(maxAnisotropy);
    scene.add(diagnosticOverlays.group);

    const bodyRoot = new THREE.Group();
    bodyRoot.name = 'human_male_anatomy';
    scene.add(bodyRoot);

    const skeletal = buildSkeletalSystem(materials);
    const organs = buildOrgansSystem(materials);
    const muscular = buildMuscularSystem(materials);
    const cardio = buildCardiovascularSystem(materials);
    const nervous = buildNervousSystem(materials);
    const skin = buildHolographicSkinSystem(materials);

    bodyRoot.add(
      skeletal.group,
      organs.group,
      muscular.group,
      cardio.group,
      nervous.group,
      skin.group,
    );

    const allGeometries: THREE.BufferGeometry[] = [
      ...skeletal.geometries,
      ...organs.geometries,
      ...muscular.geometries,
      ...cardio.geometries,
      ...nervous.geometries,
      ...skin.geometries,
    ];

    const systemGroups: Record<AnatomicalSystemId, THREE.Group> = {
      skeletal: skeletal.group,
      organs: organs.group,
      muscular: muscular.group,
      cardiovascular: cardio.group,
      nervous: nervous.group,
      skin: skin.group,
    };

    const currentOpacities: Record<AnatomicalSystemId, number> = {
      skeletal: layersRef.current.skeletal ? 1 : 0,
      organs: layersRef.current.organs ? 1 : 0,
      muscular: layersRef.current.muscular ? 1 : 0,
      cardiovascular: layersRef.current.cardiovascular ? 1 : 0,
      nervous: layersRef.current.nervous ? 1 : 0,
      skin: layersRef.current.skin ? 1 : 0,
    };

    // 7. Secondary Top-Right Orientation Silhouette Inset Scene
    const silhouetteScene = new THREE.Scene();
    const silhouetteModel = buildSilhouetteInsetModel();
    silhouetteScene.add(silhouetteModel.group);

    const silhouetteCamera = new THREE.PerspectiveCamera(
      34,
      INSET_W / INSET_H,
      0.1,
      20,
    );

    // 8. Post-Processing Bloom (GPU only; skipped on software WebGL)
    let composer: EffectComposer | null = null;
    let bloomPass: UnrealBloomPass | null = null;
    if (!isSoftwareGl) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.1,
        0.22,
        0.92,
      );
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());
    } else {
      // Pre-warm shaders only on GPU; skip on software GL
    }

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 9. Raycasting (Layer 1 only, throttled hover, drag-safe click)
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointerNdc = new THREE.Vector2();
    let lastHoverTime = 0;
    let downX = 0;
    let downY = 0;

    const findPartId = (obj: THREE.Object3D | null): string | null => {
      let cur: THREE.Object3D | null = obj;
      while (cur) {
        if (typeof cur.userData.partId === 'string') {
          return cur.userData.partId;
        }
        cur = cur.parent;
      }
      return null;
    };

    const updateNdc = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverTime < 45) return;
      lastHoverTime = now;

      updateNdc(e);
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObject(bodyRoot, true);

      let found: string | null = null;
      for (let i = 0; i < hits.length; i++) {
        if (hits[i].object.visible) {
          found = findPartId(hits[i].object);
          if (found) break;
        }
      }

      if (found !== hoveredRef.current) {
        hoveredRef.current = found;
        canvas.style.cursor = found ? 'pointer' : 'grab';
        onHoverRef.current(found);
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (dist > 6) return; // Ignore orbit drags

      updateNdc(e);
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObject(bodyRoot, true);

      let found: string | null = null;
      for (let i = 0; i < hits.length; i++) {
        if (hits[i].object.visible) {
          found = findPartId(hits[i].object);
          if (found) break;
        }
      }
      onSelectRef.current(found);
    };

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);

    // Context loss safety
    const onContextLost = (e: Event) => {
      e.preventDefault();
    };
    canvas.addEventListener('webglcontextlost', onContextLost);

    // 10. Resize Handler
    const onResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (composer) composer.setSize(w, h);
      if (bloomPass) bloomPass.resolution.set(w, h);
    };
    window.addEventListener('resize', onResize);

    // 11. Animation Loop (Hardware rAF vs. Software WebGL afterDraw pacing)
    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();
    let elapsed = 0;
    let cardiacPhase = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;

      const now = performance.now();
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      elapsed += dt;

      // Damped camera preset transitions
      if (presetTargetRef.current.active) {
        const lambda = 6.5;
        camera.position.x = THREE.MathUtils.damp(
          camera.position.x,
          presetTargetRef.current.pos.x,
          lambda,
          dt,
        );
        camera.position.y = THREE.MathUtils.damp(
          camera.position.y,
          presetTargetRef.current.pos.y,
          lambda,
          dt,
        );
        camera.position.z = THREE.MathUtils.damp(
          camera.position.z,
          presetTargetRef.current.pos.z,
          lambda,
          dt,
        );

        controls.target.x = THREE.MathUtils.damp(
          controls.target.x,
          presetTargetRef.current.target.x,
          lambda,
          dt,
        );
        controls.target.y = THREE.MathUtils.damp(
          controls.target.y,
          presetTargetRef.current.target.y,
          lambda,
          dt,
        );
        controls.target.z = THREE.MathUtils.damp(
          controls.target.z,
          presetTargetRef.current.target.z,
          lambda,
          dt,
        );

        if (
          camera.position.distanceTo(presetTargetRef.current.pos) < 0.004 &&
          controls.target.distanceTo(presetTargetRef.current.target) < 0.004
        ) {
          presetTargetRef.current.active = false;
        }
      }

      controls.update();

      // Smooth damped layer opacity transitions
      const layerIds: AnatomicalSystemId[] = [
        'skeletal',
        'organs',
        'muscular',
        'cardiovascular',
        'nervous',
        'skin',
      ];
      for (let i = 0; i < layerIds.length; i++) {
        const id = layerIds[i];
        const target = layersRef.current[id] ? 1 : 0;
        const nextAlpha = THREE.MathUtils.damp(
          currentOpacities[id],
          target,
          9.0,
          dt,
        );
        currentOpacities[id] = Math.abs(nextAlpha - target) < 0.005 ? target : nextAlpha;
        systemGroups[id].visible = currentOpacities[id] > 0.015;
        materials.updateSystemOpacity(id, currentOpacities[id]);
      }

      // Highlight hovered/selected part
      materials.updatePartHighlight(hoveredRef.current, selectedRef.current);

      // Realistic Lub-Dub Cardiac Cycle driven by Heart Rate BPM
      const bpm = bpmRef.current;
      let pulse = 0;
      if (bpm !== null) {
        const beatsPerSec = bpm / 60;
        cardiacPhase = (cardiacPhase + dt * beatsPerSec) % 1;
        const lub = Math.exp(-Math.pow((cardiacPhase - 0.14) / 0.065, 2));
        const dub = 0.65 * Math.exp(-Math.pow((cardiacPhase - 0.34) / 0.075, 2));
        pulse = Math.min(1, lub + dub);
      }

      // Contract ventricles slightly during peak systole, rebound softly
      const heartScale = 1 + pulse * 0.085;
      cardio.heartGroup.scale.set(
        heartScale,
        1 + pulse * 0.06,
        heartScale,
      );
      heartLight.intensity = (1.05 + pulse * 1.15) * currentOpacities.cardiovascular;

      // Subtle breathing thoracic expansion
      const breath = Math.sin(elapsed * 1.45) * 0.005;
      internalCyanLight.intensity = 1.24 + Math.sin(elapsed * 2.1) * 0.12;
      skeletal.group.scale.set(1 + breath, 1, 1 + breath * 1.4);

      // Update shared shader uniforms
      materials.sharedUniforms.uTime.value = elapsed;
      materials.sharedUniforms.uPulse.value = pulse;
      materials.sharedUniforms.uFlowSpeed.value = flowRef.current;

      // Update animated arterial blood flow corpuscles (zero GC)
      if (currentOpacities.cardiovascular > 0.015) {
        const { mesh, curves, phases, curveIndices, speeds } = cardio.corpuscles;
        const speedMult = flowRef.current * (0.7 + pulse * 0.65);
        for (let i = 0; i < phases.length; i++) {
          phases[i] = (phases[i] + dt * speeds[i] * speedMult) % 1;
          curves[curveIndices[i]].getPointAt(phases[i], _vec3A);
          _dummy.position.copy(_vec3A);
          const s = 0.7 + Math.sin(phases[i] * Math.PI) * 0.55;
          _dummy.scale.setScalar(s);
          _dummy.updateMatrix();
          mesh.setMatrixAt(i, _dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }

      // Stage rings subtle rotation
      stage.update(elapsed);

      // Diagnostic Tomographic Slice & Anomaly Overlays update
      if (diagnosticsRef.current) {
        const diag = diagnosticsRef.current;
        diagnosticOverlays.update({
          elapsed,
          sliceEnabled: diag.sliceEnabled,
          sliceMode: diag.sliceMode,
          slicePos: diag.slicePos,
          sliceHalf: 0.08,
          liverAnomaly: diag.anomaliesEnabled && diag.activeAnomalies?.liver_metabolic ? 1 : 0,
          kneeAnomaly: diag.anomaliesEnabled && diag.activeAnomalies?.left_knee_joint ? 1 : 0,
          armAnomaly: diag.anomaliesEnabled && diag.activeAnomalies?.right_forearm_strain ? 1 : 0,
        });
      }

      // Render main scene
      const cw = container?.clientWidth || window.innerWidth;
      const ch = container?.clientHeight || window.innerHeight;
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, cw, ch);
      renderer.clear();

      if (composer && !isSoftwareGl) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }

      // Render synchronized Top-Right Secondary Silhouette Inset
      _vec3B.subVectors(camera.position, controls.target).normalize();
      silhouetteCamera.position
        .set(0, 0.94, 0)
        .addScaledVector(_vec3B, 3.05);
      silhouetteCamera.lookAt(0, 0.94, 0);

      const insetX = cw - INSET_W - INSET_MARGIN;
      const insetY = ch - INSET_H - INSET_MARGIN;
      if (insetX > 0 && insetY > 0) {
        renderer.setScissorTest(true);
        renderer.setViewport(insetX, insetY, INSET_W, INSET_H);
        renderer.setScissor(insetX, insetY, INSET_W, INSET_H);
        renderer.clearDepth();
        renderer.render(silhouetteScene, silhouetteCamera);
        renderer.setScissorTest(false);
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    if (isSoftwareGl) {
      frameId = window.setTimeout(tick, 0);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      controls.removeEventListener('start', cancelPresetTransition);
      controls.dispose();
      envTarget.dispose();
      allGeometries.forEach((g) => g.dispose());
      materials.dispose();
      stage.dispose();
      diagnosticOverlays.dispose();
      silhouetteModel.dispose();
      composer?.dispose();
      renderer.dispose();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      <div
        ref={mountRef}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
      />
      {/* Interactive frame over the WebGL top-right secondary silhouette inset */}
      <button
        type="button"
        onClick={onResetAnterior}
        title="Reset to anterior orientation"
        aria-label="Secondary orientation silhouette, click to reset to anterior view"
        style={{
          width: `${INSET_W}px`,
          height: `${INSET_H}px`,
          top: `${INSET_MARGIN}px`,
          right: `${INSET_MARGIN}px`,
        }}
        className={`absolute z-10 rounded-lg border bg-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 cursor-pointer ${
          hideChrome
            ? 'border-transparent hover:border-sky-400/35'
            : 'border-sky-400/20 hover:border-sky-400/45'
        }`}
      />
    </div>
  );
}
