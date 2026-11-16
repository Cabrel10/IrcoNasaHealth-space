import * as THREE from 'three';

export interface SystemShaderUniforms {
  uTime: { value: number };
  uPulse: { value: number };
  uFlowSpeed: { value: number };
}

export type OrganStyle =
  | 'lungs'
  | 'bronchi'
  | 'liver'
  | 'kidneys'
  | 'intestines_colon'
  | 'intestines_small'
  | 'brain';

export interface PartMaterialHandle {
  partId: string;
  system: 'skeletal' | 'organs' | 'muscular' | 'cardiovascular' | 'nervous' | 'skin';
  material: THREE.Material;
  baseOpacity: number;
  setOpacity: (alpha: number) => void;
  setHighlight: (amount: number) => void;
}

export interface MaterialRegistry {
  sharedUniforms: SystemShaderUniforms;
  handles: PartMaterialHandle[];
  textures: THREE.Texture[];
  getSkeletalMaterial: (partId: string, opacityScale?: number) => THREE.MeshPhysicalMaterial;
  getOrganMaterial: (partId: string, style: OrganStyle) => THREE.MeshPhysicalMaterial;
  getMuscleMaterial: (partId: string) => THREE.MeshPhysicalMaterial;
  getCardioMaterial: (partId: string, isHeart?: boolean) => THREE.MeshPhysicalMaterial;
  getCoronaryMaterial: (partId: string) => THREE.MeshPhysicalMaterial;
  getVenousMaterial: (partId: string) => THREE.MeshPhysicalMaterial;
  getNerveMaterial: (partId: string, isCentral?: boolean) => THREE.ShaderMaterial;
  getSkinMaterial: (partId: string) => THREE.ShaderMaterial;
  getCorpuscleMaterial: () => THREE.MeshBasicMaterial;
  getNodeMaterial: () => THREE.MeshBasicMaterial;
  updateSystemOpacity: (
    system: PartMaterialHandle['system'],
    opacity: number,
  ) => void;
  updatePartHighlight: (hoveredId: string | null, selectedId: string | null) => void;
  dispose: () => void;
}

export function createMuscleFiberTexture(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const width = 512;
  const height = 512;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = width;
  colorCanvas.height = height;
  const ctx = colorCanvas.getContext('2d')!;

  ctx.fillStyle = '#0a254d';
  ctx.fillRect(0, 0, width, height);

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = width;
  bumpCanvas.height = height;
  const bctx = bumpCanvas.getContext('2d')!;
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 180; i++) {
    const x = (i / 180) * width;
    const wave = Math.sin(i * 0.45) * 0.5 + 0.5;
    const alpha = 0.12 + wave * 0.18;
    ctx.strokeStyle =
      i % 3 === 0
        ? `rgba(125, 211, 252, ${alpha})`
        : `rgba(30, 64, 175, ${alpha + 0.08})`;
    ctx.lineWidth = 1.4 + (i % 2);
    ctx.beginPath();
    for (let y = 0; y <= height; y += 16) {
      const dx = Math.sin((y / height) * Math.PI * 2 + i * 0.2) * 2.2;
      if (y === 0) ctx.moveTo(x + dx, y);
      else ctx.lineTo(x + dx, y);
    }
    ctx.stroke();

    const bVal = Math.floor(110 + wave * 90);
    bctx.strokeStyle = `rgb(${bVal},${bVal},${bVal})`;
    bctx.lineWidth = 2;
    bctx.beginPath();
    for (let y = 0; y <= height; y += 16) {
      const dx = Math.sin((y / height) * Math.PI * 2 + i * 0.2) * 2.2;
      if (y === 0) bctx.moveTo(x + dx, y);
      else bctx.lineTo(x + dx, y);
    }
    bctx.stroke();
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 3);
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(2, 3);
  bumpMap.anisotropy = maxAnisotropy;

  return { map, bumpMap };
}

export function createBrainGyriTexture(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bctx = bumpCanvas.getContext('2d')!;

  ctx.fillStyle = '#1e4e79';
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#909090';
  bctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 110; i++) {
    const startX = (i * 73) % size;
    const startY = (i * 137) % size;
    ctx.strokeStyle =
      i % 2 === 0 ? 'rgba(12, 42, 74, 0.78)' : 'rgba(125, 211, 252, 0.35)';
    ctx.lineWidth = i % 2 === 0 ? 5.0 : 2.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, startY);

    bctx.strokeStyle = i % 2 === 0 ? 'rgb(32, 32, 32)' : 'rgb(228, 228, 228)';
    bctx.lineWidth = i % 2 === 0 ? 6.0 : 3.8;
    bctx.lineCap = 'round';
    bctx.beginPath();
    bctx.moveTo(startX, startY);

    let cx = startX;
    let cy = startY;
    for (let s = 0; s < 6; s++) {
      const ang = Math.sin(i * 1.7 + s * 1.3) * 1.8 + i * 0.4;
      cx += Math.cos(ang) * 24;
      cy += Math.sin(ang) * 24;
      ctx.lineTo(cx, cy);
      bctx.lineTo(cx, cy);
    }
    ctx.stroke();
    bctx.stroke();
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.anisotropy = maxAnisotropy;

  return { map, bumpMap };
}

export function createBoneMicroTexture(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const bCanvas = document.createElement('canvas');
  bCanvas.width = size;
  bCanvas.height = size;
  const bctx = bCanvas.getContext('2d')!;

  ctx.fillStyle = '#a8d5f5';
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  // Realistic longitudinal cortical Haversian striations + trabecular grain
  for (let i = 0; i < 1200; i++) {
    const x = Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1) * size;
    const y = Math.abs((Math.sin(i * 78.233) * 43758.5453) % 1) * size;
    const h = 5 + (i % 16);
    ctx.fillStyle =
      i % 3 === 0
        ? 'rgba(224, 244, 255, 0.24)'
        : i % 3 === 1
          ? 'rgba(28, 78, 166, 0.18)'
          : 'rgba(125, 211, 252, 0.16)';
    ctx.fillRect(x, y, 1.3, h);

    bctx.fillStyle = i % 2 === 0 ? 'rgb(176,176,176)' : 'rgb(88,88,88)';
    bctx.fillRect(x, y, 1.4, h);
  }

  // Subtle porous trabecular speckle
  for (let i = 0; i < 420; i++) {
    const x = Math.abs((Math.sin(i * 45.164) * 29431.7) % 1) * size;
    const y = Math.abs((Math.sin(i * 93.719) * 18427.3) % 1) * size;
    ctx.fillStyle = 'rgba(186, 230, 253, 0.16)';
    ctx.fillRect(x, y, 2, 2);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bCanvas);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.anisotropy = maxAnisotropy;

  return { map, bumpMap };
}

export function createRadarStageTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;

  ctx.clearRect(0, 0, size, size);

  const grad = ctx.createRadialGradient(c, c, 20, c, c, c);
  grad.addColorStop(0, 'rgba(14, 165, 233, 0.1)');
  grad.addColorStop(0.4, 'rgba(14, 165, 233, 0.035)');
  grad.addColorStop(0.75, 'rgba(15, 23, 42, 0.015)');
  grad.addColorStop(1, 'rgba(11, 17, 32, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.055)';
  ctx.lineWidth = 1;
  const step = size / 16;
  for (let i = 1; i < 16; i++) {
    const pos = i * step;
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(size, pos);
    ctx.stroke();
  }

  const radii = [0.22, 0.36, 0.52, 0.68, 0.85];
  radii.forEach((rFrac, idx) => {
    const radius = rFrac * c;
    ctx.strokeStyle =
      idx % 2 === 0 ? 'rgba(56, 189, 248, 0.16)' : 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = idx === 2 ? 1.5 : 1.0;
    if (idx % 2 === 1) ctx.setLineDash([5, 9]);
    else ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(c, c, radius, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  // Subtle radar tick marks on outer circle
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
  ctx.lineWidth = 1;
  for (let deg = 0; deg < 360; deg += 15) {
    const rad = (deg * Math.PI) / 180;
    const inner = deg % 45 === 0 ? c * 0.64 : c * 0.66;
    const outer = c * 0.68;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(rad) * inner, c + Math.sin(rad) * inner);
    ctx.lineTo(c + Math.cos(rad) * outer, c + Math.sin(rad) * outer);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createContactShadowTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;

  const grad = ctx.createRadialGradient(c, c, 8, c, c, c);
  grad.addColorStop(0, 'rgba(2, 6, 23, 0.8)');
  grad.addColorStop(0.55, 'rgba(2, 6, 23, 0.35)');
  grad.addColorStop(1, 'rgba(2, 6, 23, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createSystemMaterialRegistry(maxAnisotropy: number): MaterialRegistry {
  const sharedUniforms: SystemShaderUniforms = {
    uTime: { value: 0 },
    uPulse: { value: 0 },
    uFlowSpeed: { value: 1 },
  };

  const muscleTex = createMuscleFiberTexture(maxAnisotropy);
  const boneTex = createBoneMicroTexture(maxAnisotropy);
  const brainTex = createBrainGyriTexture(maxAnisotropy);
  const textures: THREE.Texture[] = [
    muscleTex.map,
    muscleTex.bumpMap,
    boneTex.map,
    boneTex.bumpMap,
    brainTex.map,
    brainTex.bumpMap,
  ];

  const handles: PartMaterialHandle[] = [];
  const skeletalCache = new Map<string, THREE.MeshPhysicalMaterial>();
  const organCache = new Map<string, THREE.MeshPhysicalMaterial>();
  const muscleCache = new Map<string, THREE.MeshPhysicalMaterial>();
  const cardioCache = new Map<string, THREE.MeshPhysicalMaterial>();
  const nerveCache = new Map<string, THREE.ShaderMaterial>();
  const skinCache = new Map<string, THREE.ShaderMaterial>();

  const corpuscleMaterial = new THREE.MeshBasicMaterial({
    color: 0xff7052,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const nodeMaterial = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.62,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  function getSkeletalMaterial(partId: string, opacityScale = 1): THREE.MeshPhysicalMaterial {
    const key = `${partId}_${opacityScale}`;
    const existing = skeletalCache.get(key);
    if (existing) return existing;

    const uHighlight = { value: 0 };
    const baseOpacity = 0.5 * opacityScale;

    // Realistic semi-transparent glowing icy-blue X-ray bone with cortical texture
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xbbe6ff,
      emissive: 0x0c6396,
      emissiveIntensity: 0.34,
      roughness: 0.4,
      metalness: 0.05,
      clearcoat: 0.22,
      clearcoatRoughness: 0.28,
      map: boneTex.map,
      bumpMap: boneTex.bumpMap,
      bumpScale: 0.005,
      transparent: true,
      opacity: baseOpacity,
      depthWrite: false,
      side: THREE.FrontSide,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uHighlight = uHighlight;
      shader.fragmentShader =
        `uniform float uHighlight;\n` +
        shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           float fresnelBone = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.1);
           totalEmissiveRadiance += vec3(0.36, 0.80, 0.98) * fresnelBone * (0.58 + uHighlight * 1.0);
           totalEmissiveRadiance += vec3(0.45, 0.85, 1.0) * uHighlight * 0.32;`,
        );
    };
    mat.customProgramCacheKey = () => 'xray_bone_realistic_v4';

    skeletalCache.set(key, mat);
    handles.push({
      partId,
      system: 'skeletal',
      material: mat,
      baseOpacity,
      setOpacity: (alpha) => {
        mat.opacity = baseOpacity * alpha;
        mat.visible = alpha > 0.015;
      },
      setHighlight: (amount) => {
        uHighlight.value = amount;
        mat.emissiveIntensity = 0.34 + amount * 0.42;
      },
    });
    return mat;
  }

  function getOrganMaterial(partId: string, style: OrganStyle): THREE.MeshPhysicalMaterial {
    const key = `${partId}_${style}`;
    const existing = organCache.get(key);
    if (existing) return existing;

    const uHighlight = { value: 0 };

    // Distinct, clinically legible semi-transparent X-ray organs with clean anatomical separation
    const presets: Record<
      OrganStyle,
      {
        color: number;
        emissive: number;
        emissiveIntensity: number;
        opacity: number;
        roughness: number;
        fresnelVec: string;
        depthWrite: boolean;
        map?: THREE.Texture;
        bumpMap?: THREE.Texture;
        bumpScale?: number;
      }
    > = {
      brain: {
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.34,
        opacity: 0.56,
        roughness: 0.44,
        fresnelVec: 'vec3(0.36, 0.84, 0.98)',
        depthWrite: false,
        map: brainTex.map,
        bumpMap: brainTex.bumpMap,
        bumpScale: 0.012,
      },
      lungs: {
        color: 0x2b6cb0,
        emissive: 0x0e7490,
        emissiveIntensity: 0.24,
        opacity: 0.3,
        roughness: 0.46,
        fresnelVec: 'vec3(0.32, 0.80, 0.98)',
        depthWrite: false,
      },
      bronchi: {
        color: 0x7dd3fc,
        emissive: 0x0284c7,
        emissiveIntensity: 0.32,
        opacity: 0.48,
        roughness: 0.36,
        fresnelVec: 'vec3(0.40, 0.84, 1.0)',
        depthWrite: false,
      },
      liver: {
        color: 0x8c4a48,
        emissive: 0x4a1d24,
        emissiveIntensity: 0.28,
        opacity: 0.44,
        roughness: 0.36,
        fresnelVec: 'vec3(0.42, 0.72, 0.92)',
        depthWrite: false,
      },
      kidneys: {
        color: 0x7e3b68,
        emissive: 0x3b1536,
        emissiveIntensity: 0.28,
        opacity: 0.48,
        roughness: 0.36,
        fresnelVec: 'vec3(0.45, 0.78, 0.98)',
        depthWrite: false,
      },
      intestines_colon: {
        color: 0x476b8a,
        emissive: 0x163854,
        emissiveIntensity: 0.24,
        opacity: 0.38,
        roughness: 0.4,
        fresnelVec: 'vec3(0.32, 0.72, 0.94)',
        depthWrite: false,
      },
      intestines_small: {
        color: 0x647a96,
        emissive: 0x1e3a5f,
        emissiveIntensity: 0.22,
        opacity: 0.34,
        roughness: 0.42,
        fresnelVec: 'vec3(0.34, 0.74, 0.94)',
        depthWrite: false,
      },
    };

    const p = presets[style];
    const mat = new THREE.MeshPhysicalMaterial({
      color: p.color,
      emissive: p.emissive,
      emissiveIntensity: p.emissiveIntensity,
      roughness: p.roughness,
      metalness: 0.04,
      clearcoat: 0.28,
      clearcoatRoughness: 0.28,
      map: p.map ?? null,
      bumpMap: p.bumpMap ?? null,
      bumpScale: p.bumpScale ?? 0,
      transparent: true,
      opacity: p.opacity,
      depthWrite: p.depthWrite,
      side: THREE.FrontSide,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uHighlight = uHighlight;
      shader.fragmentShader =
        `uniform float uHighlight;\n` +
        shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           float fresnelOrg = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.2);
           totalEmissiveRadiance += ${p.fresnelVec} * fresnelOrg * (0.52 + uHighlight * 1.1);
           totalEmissiveRadiance += ${p.fresnelVec} * uHighlight * 0.35;`,
        );
    };
    mat.customProgramCacheKey = () => `organ_distinct_xray_${style}_v3`;

    organCache.set(key, mat);
    handles.push({
      partId,
      system: 'organs',
      material: mat,
      baseOpacity: p.opacity,
      setOpacity: (alpha) => {
        mat.opacity = p.opacity * alpha;
        mat.visible = alpha > 0.015;
      },
      setHighlight: (amount) => {
        uHighlight.value = amount;
        mat.emissiveIntensity = p.emissiveIntensity + amount * 0.42;
      },
    });
    return mat;
  }

  function getMuscleMaterial(partId: string): THREE.MeshPhysicalMaterial {
    const existing = muscleCache.get(partId);
    if (existing) return existing;

    const uHighlight = { value: 0 };
    const baseOpacity = 0.16;

    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x1e40af,
      emissive: 0x0c4a6e,
      emissiveIntensity: 0.14,
      roughness: 0.46,
      metalness: 0.04,
      clearcoat: 0.15,
      map: muscleTex.map,
      bumpMap: muscleTex.bumpMap,
      bumpScale: 0.008,
      transparent: true,
      opacity: baseOpacity,
      depthWrite: false,
      side: THREE.FrontSide,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uHighlight = uHighlight;
      shader.fragmentShader =
        `uniform float uHighlight;\n` +
        shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           float fresnelM = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.5);
           totalEmissiveRadiance += vec3(0.14, 0.50, 0.88) * fresnelM * (0.45 + uHighlight * 1.2);
           totalEmissiveRadiance += vec3(0.22, 0.72, 1.0) * uHighlight * 0.35;`,
        );
    };
    mat.customProgramCacheKey = () => 'xray_muscle_subtle_v3';

    muscleCache.set(partId, mat);
    handles.push({
      partId,
      system: 'muscular',
      material: mat,
      baseOpacity,
      setOpacity: (alpha) => {
        mat.opacity = baseOpacity * alpha;
        mat.visible = alpha > 0.015;
      },
      setHighlight: (amount) => {
        uHighlight.value = amount;
        mat.emissiveIntensity = 0.14 + amount * 0.45;
      },
    });
    return mat;
  }

  function getCardioMaterial(partId: string, isHeart = false): THREE.MeshPhysicalMaterial {
    const key = `${partId}_${isHeart ? 'h' : 'v'}`;
    const existing = cardioCache.get(key);
    if (existing) return existing;

    const uHighlight = { value: 0 };
    const baseOpacity = isHeart ? 0.96 : 0.9;

    // Prominent, realistic red-orange heart with subtle non-blinding pulse glow
    const mat = new THREE.MeshPhysicalMaterial({
      color: isHeart ? 0xf24e24 : 0xdc3222,
      emissive: isHeart ? 0xc22b0e : 0x8f1a14,
      emissiveIntensity: isHeart ? 0.72 : 0.56,
      roughness: isHeart ? 0.34 : 0.28,
      metalness: 0.04,
      clearcoat: 0.46,
      clearcoatRoughness: 0.24,
      transparent: true,
      opacity: baseOpacity,
      depthWrite: true,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = sharedUniforms.uTime;
      shader.uniforms.uPulse = sharedUniforms.uPulse;
      shader.uniforms.uFlowSpeed = sharedUniforms.uFlowSpeed;
      shader.uniforms.uHighlight = uHighlight;

      shader.vertexShader =
        `varying vec2 vCardioUv;\n` +
        shader.vertexShader.replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>
           vCardioUv = uv;`,
        );

      shader.fragmentShader =
        `uniform float uTime;
         uniform float uPulse;
         uniform float uFlowSpeed;
         uniform float uHighlight;
         varying vec2 vCardioUv;\n` +
        shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           float wave = pow(0.5 + 0.5 * sin(vCardioUv.x * 16.0 - uTime * uFlowSpeed * 6.0), 3.0);
           float ndv = abs(dot(normalize(vNormal), normalize(vViewPosition)));
           float fresnelC = pow(1.0 - ndv, 2.2);
           float innerCore = pow(ndv, 1.5);
           float pulseBoost = ${
             isHeart
               ? '(uPulse * 0.48 * innerCore + uPulse * 0.16)'
               : '(uPulse * 0.22 + wave * 0.42)'
           };
           totalEmissiveRadiance += vec3(0.95, 0.30, 0.08) * pulseBoost;
           totalEmissiveRadiance += vec3(1.0, 0.44, 0.22) * (fresnelC * 0.18 + uHighlight * 0.52);`,
        );
    };
    mat.customProgramCacheKey = () => (isHeart ? 'cardio_heart_v4' : 'cardio_vessel_v4');

    cardioCache.set(key, mat);
    handles.push({
      partId,
      system: 'cardiovascular',
      material: mat,
      baseOpacity,
      setOpacity: (alpha) => {
        mat.opacity = baseOpacity * alpha;
        mat.visible = alpha > 0.015;
      },
      setHighlight: (amount) => {
        uHighlight.value = amount;
        mat.emissiveIntensity = (isHeart ? 0.72 : 0.56) + amount * 0.45;
      },
    });
    return mat;
  }

  function getCoronaryMaterial(partId: string): THREE.MeshPhysicalMaterial {
    const key = `${partId}_coronary`;
    const existing = cardioCache.get(key);
    if (existing) return existing;

    const uHighlight = { value: 0 };
    const baseOpacity = 0.98;

    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xff7a47,
      emissive: 0xe84317,
      emissiveIntensity: 0.78,
      roughness: 0.26,
      metalness: 0.04,
      clearcoat: 0.45,
      transparent: true,
      opacity: baseOpacity,
      depthWrite: true,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uPulse = sharedUniforms.uPulse;
      shader.uniforms.uHighlight = uHighlight;
      shader.fragmentShader =
        `uniform float uPulse;
         uniform float uHighlight;\n` +
        shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           totalEmissiveRadiance += vec3(1.0, 0.44, 0.18) * (uPulse * 0.32 + uHighlight * 0.48);`,
        );
    };
    mat.customProgramCacheKey = () => 'cardio_coronary_v2';

    cardioCache.set(key, mat);
    handles.push({
      partId,
      system: 'cardiovascular',
      material: mat,
      baseOpacity,
      setOpacity: (alpha) => {
        mat.opacity = baseOpacity * alpha;
        mat.visible = alpha > 0.015;
      },
      setHighlight: (amount) => {
        uHighlight.value = amount;
        mat.emissiveIntensity = 0.78 + amount * 0.45;
      },
    });
    return mat;
  }

  function getVenousMaterial(partId: string): THREE.MeshPhysicalMaterial {
    const key = `${partId}_vein`;
    const existing = cardioCache.get(key);
    if (existing) return existing;

    const uHighlight = { value: 0 };
    const baseOpacity = 0.72;

    // Fine cool-blue systemic venous vessels paired with red arteries
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x2563eb,
      emissive: 0x0284c7,
      emissiveIntensity: 0.42,
      roughness: 0.34,
      metalness: 0.05,
      clearcoat: 0.35,
      transparent: true,
      opacity: baseOpacity,
      depthWrite: false,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uHighlight = uHighlight;
      shader.fragmentShader =
        `uniform float uHighlight;\n` +
        shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           totalEmissiveRadiance += vec3(0.2, 0.65, 1.0) * uHighlight * 0.5;`,
        );
    };
    mat.customProgramCacheKey = () => 'cardio_vein_v1';

    cardioCache.set(key, mat);
    handles.push({
      partId,
      system: 'cardiovascular',
      material: mat,
      baseOpacity,
      setOpacity: (alpha) => {
        mat.opacity = baseOpacity * alpha;
        mat.visible = alpha > 0.015;
      },
      setHighlight: (amount) => {
        uHighlight.value = amount;
        mat.emissiveIntensity = 0.42 + amount * 0.5;
      },
    });
    return mat;
  }

  function getNerveMaterial(partId: string, isCentral = false): THREE.ShaderMaterial {
    const key = `${partId}_${isCentral ? 'c' : 'p'}`;
    const existing = nerveCache.get(key);
    if (existing) return existing;

    const uOpacity = { value: 1 };
    const uHighlight = { value: 0 };
    const baseOpacity = isCentral ? 0.8 : 0.68;

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: sharedUniforms.uTime,
        uFlowSpeed: sharedUniforms.uFlowSpeed,
        uOpacity,
        uHighlight,
        uBaseColor: { value: new THREE.Color(isCentral ? 0x38bdf8 : 0x22d3ee) },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormalDir;
        varying vec3 vViewDir;
        void main() {
          vUv = uv;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vNormalDir = normalize(normalMatrix * normal);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uFlowSpeed;
        uniform float uOpacity;
        uniform float uHighlight;
        uniform vec3 uBaseColor;
        varying vec2 vUv;
        varying vec3 vNormalDir;
        varying vec3 vViewDir;
        void main() {
          float fresnel = pow(1.0 - abs(dot(vNormalDir, vViewDir)), 1.7);
          float impulse = pow(0.5 + 0.5 * sin(vUv.x * 24.0 - uTime * (3.6 + uFlowSpeed * 2.2)), 8.0);
          vec3 col = uBaseColor * (0.62 + fresnel * 0.4 + impulse * 0.55 + uHighlight * 0.8);
          float alpha = (${baseOpacity.toFixed(2)} + impulse * 0.1) * uOpacity;
          gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.92));
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    nerveCache.set(key, mat);
    handles.push({
      partId,
      system: 'nervous',
      material: mat,
      baseOpacity,
      setOpacity: (alpha) => {
        uOpacity.value = alpha;
        mat.visible = alpha > 0.015;
      },
      setHighlight: (amount) => {
        uHighlight.value = amount;
      },
    });
    return mat;
  }

  function getSkinMaterial(partId: string): THREE.ShaderMaterial {
    const existing = skinCache.get(partId);
    if (existing) return existing;

    const uOpacity = { value: 1 };
    const uHighlight = { value: 0 };
    const baseOpacity = 1.0;

    // Semi-transparent holographic shell with faint anti-aliased wireframe texture & subtle electric blue rim
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        uTime: sharedUniforms.uTime,
        uOpacity,
        uHighlight,
      },
      vertexShader: `
        out vec3 vNormalDir;
        out vec3 vViewDir;
        out vec3 vLocalPos;
        void main() {
          vLocalPos = position;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vNormalDir = normalize(normalMatrix * normal);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        uniform float uHighlight;
        in vec3 vNormalDir;
        in vec3 vViewDir;
        in vec3 vLocalPos;
        out vec4 fragColor;

        float wireLine(float coord, float widthPx) {
          float dist = abs(fract(coord - 0.5) - 0.5) / max(fwidth(coord), 0.0001);
          return 1.0 - smoothstep(0.0, widthPx, dist);
        }

        void main() {
          vec3 n = normalize(vNormalDir);
          vec3 v = normalize(vViewDir);
          float ndotv = clamp(abs(dot(n, v)), 0.0, 1.0);

          // Subtle electric blue rim lighting + gentle vertical illumination gradient
          float rim = pow(1.0 - ndotv, 2.25);
          float topShade = 0.72 + 0.28 * clamp(n.y * 0.5 + 0.5, 0.0, 1.0);

          // Faint, razor-sharp 3D triplanar holographic wireframe contours (zero UV seams)
          float wy = wireLine(vLocalPos.y * 28.0, 1.1);
          float wx = wireLine(vLocalPos.x * 24.0, 1.1);
          float wz = wireLine(vLocalPos.z * 24.0, 1.1);
          float wire = max(wy, max(wx * 0.65, wz * 0.65));
          float wireMask = wire * (0.14 + rim * 0.42);

          vec3 coreTint = vec3(0.03, 0.14, 0.34);
          vec3 rimTint = vec3(0.18, 0.66, 1.0) * topShade;
          vec3 wireTint = vec3(0.28, 0.78, 1.0);
          vec3 color = mix(coreTint, rimTint, rim)
                     + wireTint * wireMask * 0.34
                     + vec3(0.35, 0.82, 1.0) * uHighlight * 0.32;

          // Ultra-clean translucent core so internal anatomy & organs stay crisp
          float alpha = (0.042 + rim * 0.48 + wireMask * 0.11 + uHighlight * 0.14) * uOpacity;
          fragColor = vec4(color, clamp(alpha, 0.0, 0.68));
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });

    skinCache.set(partId, mat);
    handles.push({
      partId,
      system: 'skin',
      material: mat,
      baseOpacity,
      setOpacity: (alpha) => {
        uOpacity.value = alpha;
        mat.visible = alpha > 0.015;
      },
      setHighlight: (amount) => {
        uHighlight.value = amount;
      },
    });
    return mat;
  }

  function updateSystemOpacity(
    system: PartMaterialHandle['system'],
    opacity: number,
  ) {
    for (let i = 0; i < handles.length; i++) {
      if (handles[i].system === system) {
        handles[i].setOpacity(opacity);
      }
    }
    if (system === 'cardiovascular') {
      corpuscleMaterial.opacity = 0.82 * opacity;
      corpuscleMaterial.visible = opacity > 0.015;
    }
    if (system === 'nervous') {
      nodeMaterial.opacity = 0.62 * opacity;
      nodeMaterial.visible = opacity > 0.015;
    }
  }

  function updatePartHighlight(hoveredId: string | null, selectedId: string | null) {
    for (let i = 0; i < handles.length; i++) {
      const h = handles[i];
      if (h.partId === selectedId) h.setHighlight(1.0);
      else if (h.partId === hoveredId) h.setHighlight(0.55);
      else h.setHighlight(0.0);
    }
  }

  function dispose() {
    for (let i = 0; i < handles.length; i++) {
      handles[i].material.dispose();
    }
    corpuscleMaterial.dispose();
    nodeMaterial.dispose();
    for (let i = 0; i < textures.length; i++) {
      textures[i].dispose();
    }
  }

  return {
    sharedUniforms,
    handles,
    textures,
    getSkeletalMaterial,
    getOrganMaterial,
    getMuscleMaterial,
    getCardioMaterial,
    getCoronaryMaterial,
    getVenousMaterial,
    getNerveMaterial,
    getSkinMaterial,
    getCorpuscleMaterial: () => corpuscleMaterial,
    getNodeMaterial: () => nodeMaterial,
    updateSystemOpacity,
    updatePartHighlight,
    dispose,
  };
}
