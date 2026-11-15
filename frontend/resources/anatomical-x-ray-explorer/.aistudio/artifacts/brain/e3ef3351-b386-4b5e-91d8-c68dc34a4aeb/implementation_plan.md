# Interactive 3D Anatomical X-Ray Visualization

An interactive, full-viewport Three.js medical visualization rendering an adult human male in clinical anatomical standing posture with five layered, procedurally sculpted physiological systems—Skeletal, Muscular, Cardiovascular, Nervous, and Holographic Skin—augmented by raycast anatomical inspection, a synchronized top-right orientation silhouette, and real-time cardiac BPM and arterial flow controls.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and UX decisions incorporate your Phase 1 selections and govern the build. Review and approve to begin implementation.

- **Confirmed Decision 1 — Interactive Layering & Clinical Inspection**: All five anatomical systems (Skeletal, Muscular, Cardiovascular, Nervous, Holographic Skin) support independent visibility toggles, solo/isolate inspection, and direct 3D raycast hover/click selection to inspect clinical region details.
- **Confirmed Decision 2 — Viewport-First HUD & Top-Right Silhouette**: The 3D viewport stays full-bleed (`100vw × 100vh`) with a collapsible bottom control dock (collapse/expand toggle + `H` shortcut for unobstructed viewing) and a live secondary male-body orientation silhouette inset in the top-right corner that mirrors camera rotation in real time.
- **Confirmed Decision 3 — Dynamic Cardiac & Vascular Kinematics**: A real-time Heart Rate (45–160 BPM) and Arterial Flow Speed control drives a physiological dual-peak systole/diastole contraction of the 3D heart, rhythmic internal chest illumination, and travelling arterial pressure pulses along the branching vascular shaders.
- **Recommended Default — Procedural Multi-Part Anatomy (Zero External Assets)**: Rather than relying on external `.glb` models or remote textures that can fail to load, every anatomical structure is procedurally constructed in Three.js using multi-part `THREE.Group` assemblies, `CatmullRomCurve3` `TubeGeometry`, `LatheGeometry`, `InstancedMesh`, and procedural `CanvasTexture` maps for striated muscle fibers and holographic wireframes.

---

## 1. Overview & Core Concept

- **What It Does**: Presents a clinical, futuristic X-ray hologram of the human male anatomy suspended over a deep navy (`#0B1120`) concentric radar stage with overhead volumetric spotlighting. Users can orbit 360°, zoom into any anatomical region, toggle or isolate physiological layers, adjust cardiac BPM and arterial flow velocity, and click anatomical structures to inspect clinical metadata.
- **Target Audience / Persona**: Medical educators, clinical visualization designers, biomechanics students, and interactive science showcases seeking an immediate, zero-friction anatomical explorer.
- **Key Value**: Combines photorealistic volumetric X-ray aesthetics with responsive 60fps physiological simulation and unobstructed spatial inspection.

---

## 2. User Experience & Visual Design

### Spatial Composition & Viewport Layout

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Anatomical X-Ray Explorer                    ┌─────────────────────────┐  │
│  Anterior · Full Body                         │   Top-Right Secondary   │  │
│                                               │  Orientation Silhouette │  │
│                                               │   (Live Camera Sync)    │  │
│                                               └─────────────────────────┘  │
│                                                                            │
│                                                                            │
│                        3D ANATOMICAL X-RAY SUBJECT                         │
│                    (100% Unobstructed Center Viewport)                     │
│                     Hover / Click Any Bone, Organ, or                      │
│                      Vessel to Highlight & Inspect                         │
│                                                                            │
│  ┌───────────────────────────┐                                             │
│  │ Selected Region Drawer    │  (Appears only when a 3D structure          │
│  │ (Compact, Dismissible)    │   is clicked; zero-clutter default)         │
│  └───────────────────────────┘                                             │
│                           [ ▾ Hide Controls (H) ]                          │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Systems: [Skin] [Muscle] [Skeleton] [Vascular] [Nerves]  |  72 BPM  │  │
│  │  Flow: 1.0x   View: [Anterior] [Lateral] [Posterior] [Thorax]        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Key User Flows**:
  1. **Zero-State Arrival**: Opens immediately to the full-body male hologram standing in anatomical position (palms facing forward, arms slightly abducted) illuminated by an overhead soft blue volumetric spotlight and internal cyan core glow over concentric radar rings in `#0B1120`.
  2. **Camera & Silhouette Sync**: Dragging to orbit or scrolling to zoom smoothly damps the main camera while the top-right secondary body silhouette rotates in sync, acting as a spatial orientation compass (clicking it snaps smoothly back to Anterior view).
  3. **Layer Isolation & Inspection**: Toggling any of the five system buttons in the bottom dock fades or reveals that physiological system; clicking any anatomical structure highlights it with a luminous rim pulse and reveals a compact, dismissible clinical card at the bottom-left without covering the figure.
  4. **Cardiac & Vascular Simulation**: Dragging the Heart Rate (BPM) or Flow Speed sliders in the dock dynamically accelerates/decelerates the heart's ventricular contraction cycle, chest pulse light, and travelling red arterial flow waves.
  5. **Cinema / Clean View**: Clicking `Hide Controls` (or pressing `H`) slides the bottom dock out of frame so only the pure visualization and top-right silhouette remain.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Clinical holographic precision—sharp silhouette separation, volumetric depth, zero decorative clutter, and zero text baked onto the 3D scene itself.
  - *Color Palette & Mood*:
    - Deep Navy Canvas (`--background`): `#0B1120` (horizon-matched `FogExp2` and stage backdrop).
    - Structural Dock & Drawer Surfaces: Solid translucent slate `rgba(11, 17, 32, 0.90)` with crisp `1px solid rgba(56, 189, 248, 0.18)` hairline borders (no `backdrop-filter` over WebGL to preserve GPU/software WebGL frame pacing).
    - Anatomical Material Palette:
      - *Skeletal*: Translucent X-ray bone white/ice-blue (`#E0F2FE` / `#7DD3FC`) with Fresnel edge luminescence.
      - *Muscular*: Semi-transparent striated deep sapphire/cyan (`#1D4ED8` / `#38BDF8`) fiber shaders.
      - *Cardiovascular*: Pulsing arterial crimson (`#EF4444` / `#DC2626`) with luminous oxy-pulse waves (`#FF6B6B`).
      - *Nervous*: Delicate electric cyan (`#22D3EE` / `#67E8F9`) neural tracts and synaptic nodes.
      - *Holographic Skin*: Subtle electric-blue (`#0EA5E9`) Fresnel rim shell with faint procedural wireframe mesh overlay.
  - *Typography & Hierarchy*: `Plus Jakarta Sans` for crisp UI labels paired with `JetBrains Mono` (`tabular-nums`) for BPM, flow multiplier, and anatomical dimensions. No static pill enclosures, no `//` code prefixes, and no pulsing status dots in the UI.
  - *Interactive Feedback & Motion*: Smooth `200ms` CSS transitions on dock collapse and button states; frame-rate-independent `THREE.MathUtils.damp` interpolation for camera presets and layer opacity fades.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Procedural Anatomical Sculpting vs. External Mesh Assets**
  - *Chosen Approach*: Construct the five anatomical systems purely in TypeScript/Three.js using anatomically proportioned spline curves, lofted cross-sections, `LatheGeometry`, `TubeGeometry`, `ExtrudeGeometry`, and `InstancedMesh`.
  - *Why*: Eliminates external `.glb`/texture network dependencies (zero 404 risk), guarantees exact anatomical alignment between skin, muscle, bone, arteries, and nerves, and allows per-system custom shaders (X-ray Fresnel, striated fibers, travelling arterial pulses, synaptic sparks).
  - *Alternatives Considered*: Loading a static external 3D model—rejected due to unhosted asset fragility and lack of fine-grained per-vessel/per-nerve shader control.

- **Decision 2 — Synchronized Mini WebGL Pass for Top-Right Secondary Silhouette**
  - *Chosen Approach*: Render the secondary silhouette in the top-right corner of the WebGL canvas using `renderer.setViewport` and `renderer.setScissor` with a dedicated orthographic/perspective inset camera synced to the main camera's spherical azimuth/polar orientation.
  - *Why*: Zero extra WebGL context overhead, pixel-sharp holographic contour matching the exact pose and layer state of the primary figure, and respects the "no text, no labels" visual clarity inside the silhouette frame.
  - *Alternatives Considered*: Mounting a second WebGL context or static 2D SVG—rejected because multiple WebGL contexts risk browser resource exhaustion and static SVGs cannot reflect live 3D orbit rotation.

- **Decision 3 — Software WebGL Guard & Selective Post-Processing**
  - *Chosen Approach*: Probe `WEBGL_debug_renderer_info` once at initialization; on hardware GPUs, run `EffectComposer` + `UnrealBloomPass` for luminous volumetric X-ray glow alongside `RoomEnvironment` PMREM reflections; on software WebGL (`SwiftShader`/`llvmpipe`), bypass multi-pass bloom and pace frames via `afterDraw` WebGL sync fences while keeping identical scene geometry, shaders, and lighting.
  - *Why*: Ensures smooth 60fps performance on GPUs and responsive, stall-free rendering in headless or software-rendered environments.

---

## 4. Technical Architecture & Data Strategy

### System Architecture & Module Flow

```
┌───────────────────────────────────────────────────────────────────────────┐
│                              React UI Shell                               │
│  ┌─────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐  │
│  │  Top-Left Minimal   │  │   Clinical Region    │  │ Collapsible      │  │
│  │  Title & Pose Hint  │  │   Inspector Card     │  │ Bottom Dock (H)  │  │
│  └──────────┬──────────┘  └──────────▲───────────┘  └────────┬─────────┘  │
│             │                        │ Selection             │ Controls   │
│             │                        │ Events                │ State Ref  │
└─────────────┼────────────────────────┼───────────────────────┼────────────┘
              │                        │                       │
┌─────────────▼────────────────────────┴───────────────────────▼────────────┐
│                   Three.js Viewport Controller (useRef)                   │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  Main Scene + Studio Lighting + Volumetric Spotlight + Radar Stage  │  │
│  │  ┌────────────┐ ┌────────────┐ ┌───────────┐ ┌────────┐ ┌────────┐  │  │
│  │  │  Skeletal  │ │  Muscular  │ │  Cardio-  │ │ Nervous│ │ Holo   │  │  │
│  │  │  System    │ │  System    │ │  vascular │ │ System │ │ Skin   │  │  │
│  │  └─────┬──────┘ └─────┬──────┘ └─────┬─────┘ └───┬────┘ └───┬────┘  │  │
│  │        └──────────────┴──────────────┴───────────┴──────────┘       │  │
│  │                    Shared Anatomical Rig & Raycast Proxy Layer      │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  ┌───────────────────────────────┐  │
│  │ Top-Right Silhouette Camera      │  │ Render Loop & Kinematics      │  │
│  │ (Scissor Inset, Synced Azimuth)  │  │ (BPM Lub-Dub, Arterial Pulse, │  │
│  └──────────────────────────────────┘  │  Damped Presets, Bloom/FBO)   │  │
│                                        └───────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────┘
```

### Data Model & Interactive State

- **Anatomical Layer State**: Per-system visibility booleans and smooth interpolated opacity targets (`skeletal`, `muscular`, `cardiovascular`, `nervous`, `skin`), plus an "Isolate System" single-click shortcut.
- **Physiological Simulation Parameters**:
  - `heartRateBpm`: `number` (`45`–`160`, default `72`) driving a realistic double-peak cardiac cycle (`systole` at phase `0.0–0.28`, `diastolic rebound` at `0.32–0.50`) applied to ventricular/atrial mesh scale, internal crimson `PointLight` intensity, and vascular pulse shader uniforms.
  - `flowSpeed`: `number` (`0.25x`–`2.5x`, default `1.0x`) scaling the travelling arterial pressure wave frequency and neural impulse propagation velocity.
- **Inspection & Camera State**:
  - `selectedPart`: `AnatomicalPartMetadata | null` (id, system category, clinical title, anatomical region, brief physiological summary, key vascular/neural supply).
  - `hoveredPartId`: `string | null` driving subtle highlight modulation on the hovered structure and `pointer` cursor feedback.
  - `cameraPreset`: `'anterior' | 'lateral' | 'posterior' | 'thoracic'` smoothly damped via `THREE.MathUtils.damp` and automatically cancelled if the user initiates manual `OrbitControls` drag/zoom.

### Interactive Component & State Mapping

- **Bottom Control Dock**:
  - *Layer Toggle Matrix*: Five system buttons (`Skin`, `Muscular`, `Skeletal`, `Cardiovascular`, `Nervous`) with individual eye/visibility toggles and double-click or dedicated "Solo" focus behavior; updates `targetLayerOpacities` ref without re-mounting WebGL.
  - *Cardiac & Flow Telemetry Controls*: Range sliders for Heart Rate (`BPM`) and Flow Speed (`x`) with live tabular-nums readouts that update shader uniforms and cardiac kinematics in real time.
  - *Camera Preset Selector*: `Full Anterior`, `Thoracic Focus`, `Lateral`, and `Posterior` buttons triggering damped camera/target transitions.
  - *Collapse Toggle (`H`)*: Slides the bottom dock smoothly downward (`transform: translateY(...)`) for unobstructed full-screen viewing.
- **Top-Right Silhouette Inset**:
  - Renders a clean miniature cyan wireframe/X-ray silhouette of the same male body inside a subtle framed corner viewport (`~130×170px`) synced to the main camera's orbit angles; clicking the inset smoothly resets to the straight anterior diagnostic framing.
- **3D Raycast Inspector**:
  - Dedicated raycast layer (`layers.set(1)`) on anatomical mesh groups with throttled `pointermove` hover detection and drag-safe `pointerup` click selection (ignoring orbit drags > 5px) to highlight structures and display the dismissible clinical detail drawer.
