# Inventaire des ressources 3D et de la documentation anatomique

Ce document dresse l'inventaire exhaustif des ressources anatomiques 3D du projet IRCO, de la documentation anatomique et scientifique disponible, ainsi que la correspondance exacte entre les maillages 3D, les systèmes anatomiques, les dangers de vol spatial et les extraits vérifiés du corpus scientifique (`data/corpus.jsonl` et `data/hazard_map.json`).

Conformément à la politique de vérité scientifique d'IRCO, **aucun lien organe ↔ danger n'est extrapolé ou inventé**. Toute zone anatomique sans extrait lu et vérifié reliant explicitement cet organe à un danger reste en statut `no_documented_link` et est affichée de manière neutre (gris) dans l'interface.

---

## 1. Inventaire des ressources 3D

Le mannequin anatomique d'IRCO est un modèle 3D volumétrique procédural médical développé en Three.js / WebGL. Il ne dépend d'aucun fichier binaire externe (`.glb`, `.gltf`, `.obj`) mais est généré programmatiquement via un catalogue et des générateurs géométriques dédiés.

### 1.1 Composants et générateurs géométriques (`frontend/src/anatomy/`)

| Fichier | Système | Description |
|---|---|---|
| `catalog.ts` | Tous | Registre statique `ANATOMICAL_CATALOG` indexant les 20 structures avec nom latin, système, région, vascularisation et innervation. |
| `types.ts` | Tous | Définitions TypeScript (`AnatomicalSystemId`, `AnatomicalPartInfo`, `DiagnosticState`). |
| `proportions.ts` | Morphologie | Constantes anthropométriques standard (repères osseux, courbures rachidiennes, centres articulaires). |
| `geometryUtils.ts` | Outils | Utilitaires de maillage, extrusion de tubes coniques anatomiques (`createTaperedTube`), étiquetage `userData.anatomicalPartId`. |
| `materials.ts` | Rendu | Registre de matériaux shaders PBR médicaux (effet rayons X, fresnel translucide, impulsions vasculaires). |
| `buildCardiovascular.ts` | `cardiovascular` | Myocarde ventriculaire sculpté, oreillettes, arbre coronaire (IVA, D1, D2, CD), aorte, veine cave, troncs périphériques et particules sanguines instanciées. |
| `buildOrgans.ts` | `organs` / `nervous` | Encéphale avec gyri et sillon longitudinal, tronc cérébral, poumons lobés et arbre trachéobronchique, foie avec vésicule biliaire, reins avec surrénales et uretères, côlon haustré et anses grêles. |
| `buildSkeletal.ts` | `skeletal` | Calvaire, mandibule, rachis 24 vertèbres + sacrum, cage thoracique 12 paires + sternum, ceintures scapulaire et pelvienne, diaphyses et épiphyses des membres. |
| `buildMuscular.ts` | `muscular` | Faisceaux striés pectoraux, deltoïdes, sangle abdominale, fléchisseurs brachiaux, quadriceps et triceps sural. |
| `buildNervous.ts` | `nervous` | Plexus brachiaux, nerfs intercostaux, troncs sciatiques et radiations périphériques. |
| `buildHolographicSkin.ts` | `skin` | Enveloppe cutanée holographique semi-transparente pour repères de surface. |
| `buildDiagnosticOverlays.ts`| Diagnostic | Plans de coupe tomodensitométrique (axial, sagittal) et marqueurs d'anomalies. |

### 1.2 Liste exhaustive des zones du maillage (`zone_id`)

Les identifiants ci-dessous correspondent exactement aux clés de `ANATOMICAL_CATALOG` et aux attributs `userData.anatomicalPartId` tagués sur les maillages Three.js :

| Zone ID | Nom usuel | Nom latin | Système anatomique | Région corporelle |
|---|---|---|---|---|
| `heart` | Heart & Great Vessels | Cor et Vasa Majora | `cardiovascular` | Médiastin moyen |
| `arterial_tree` | Systemic Vascular Network | Systema Vasculare | `cardiovascular` | Systémique corps entier |
| `skull` | Cranium & Mandible | Cranium et Mandibula | `skeletal` | Céphalique |
| `spine` | Vertebral Column & Sacrum | Columna Vertebralis | `skeletal` | Dorsal axial |
| `ribcage` | Thoracic Cage & Sternum | Cavea Thoracis | `skeletal` | Thoracique |
| `clavicle_scapula` | Pectoral Girdle | Cingulum Pectorale | `skeletal` | Épaule |
| `pelvis` | Pelvic Girdle | Cingulum Pelvicum | `skeletal` | Pelvienne |
| `upper_limb_bones` | Upper Limb Skeleton | Ossa Membri Superioris | `skeletal` | Brachiale & antébrachiale |
| `lower_limb_bones` | Lower Limb Skeleton | Ossa Membri Inferioris | `skeletal` | Fémorale & crurale |
| `pectorals_deltoids` | Pectoral & Deltoid Complex | Mm. Pectoralis Major et Deltoideus | `muscular` | Thorax antérieur & épaule |
| `abdominals_obliques` | Abdominal Wall Musculature | Mm. Rectus Abdominis et Obliqui | `muscular` | Abdominale |
| `arm_muscles` | Brachial & Forearm Flexors | Mm. Biceps Brachii et Antebrachii | `muscular` | Membre supérieur |
| `leg_muscles` | Quadriceps & Crural Complex | Mm. Quadriceps Femoris et Triceps Surae | `muscular` | Membre inférieur |
| `lungs` | Lungs & Bronchial Tree | Pulmones et Arbor Bronchialis | `organs` | Thoracique |
| `liver` | Liver | Hepar | `organs` | Hypochondre droit |
| `kidneys` | Kidneys & Ureters | Renes et Ureteres | `organs` | Rétropéritonéale lombaire |
| `intestines` | Small & Large Intestines | Intestinum Tenue et Crassum | `organs` | Abdominopelvienne |
| `brain_spinal_cord` | Encephalon & Spinal Cord | Systema Nervosum Centrale | `nervous` | Boîte crânienne & canal vertébral |
| `peripheral_nerves` | Peripheral Nerve Plexuses | Plexus Brachialis et Lumbosacralis | `nervous` | Cervicale, thoracique, membres |
| `holo_skin` | Cutaneous Holographic Envelope | Integumentum Commune | `skin` | Enveloppe externe |

---

## 2. Documentation scientifique et corpus disponible

Le corpus scientifique sous contrôle de source est stocké dans `data/corpus.jsonl` et indexé via `data/hazard_map.json`. Il contient 11 résumés curés et documentés provenant de la NASA, de l'ASC (CSA) et de la NOAA.

### 2.1 Synthèse du corpus (`data/corpus.jsonl`)

| ID Document | Éditeur | Titre / Section | Danger associé | Systèmes anatomiques cités |
|---|---|---|---|---|
| `nasa-hrp-hazards-overview` | NASA HRP | 5 Hazards of Human Spaceflight | `null` (vue d'ensemble) | `[]` |
| `nasa-hrp-cardiovascular-risk` | NASA HRP | Cardiovascular Adaptations | `altered_gravity` | `["cardiovascular"]` |
| `nasa-hrp-sleep-schedules` | NASA HRP | Inadequate Sleep & Schedules | `isolation` | `["behavioral"]` |
| `nasa-hrp-ongoing-cipher` | NASA HRP | CIPHER and Standard Measures | `altered_gravity` | `["cardiovascular", "behavioral"]` |
| `csa-space-radiation-effects` | CSA | Space radiation exposure & monitoring | `radiation` | `["hematologic", "ocular"]` |
| `csa-radi-n2-monitoring` | CSA | Radi-N2: Tracking space radiation | `radiation` | `["hematologic", "ocular"]` |
| `csa-why-space-science` | CSA | Why do we conduct science in space? | `null` (recherche générale) | `[]` |
| `csa-iss-experiments-cardiovascular` | CSA | Current experiments / cardiovascular | `altered_gravity` | `["cardiovascular"]` |
| `csa-evarm-dosimetry` | CSA | EVARM measurement method | `radiation` | `["hematologic", "ocular"]` |
| `noaa-swpc-realtime-feeds` | NOAA SWPC | Space Weather Prediction Center | `radiation` | `[]` (contexte environnemental) |
| `nasa-osdr-eda-rr1-telemetry` | NASA OSDR | ISS telemetry (RR-1) | `hostile_environment` | `[]` (contexte cabine) |

---

## 3. Correspondance Zone 3D ↔ Danger ↔ Source documentaire

### 3.1 Tableau de croisement systématique

| Zone ID | Système anatomique | Statut de liaison | Dangers associés | Indicateurs liés | Documents du corpus prouvant le lien |
|---|---|---|---|---|---|
| `heart` | `cardiovascular` | **`sourced`** | `altered_gravity` | `heart_rate` | `nasa-hrp-cardiovascular-risk`, `csa-iss-experiments-cardiovascular`, `nasa-hrp-ongoing-cipher` |
| `arterial_tree` | `cardiovascular` | **`sourced`** | `altered_gravity` | `heart_rate` | `nasa-hrp-cardiovascular-risk`, `csa-iss-experiments-cardiovascular`, `nasa-hrp-ongoing-cipher` |
| `skull` | `skeletal` | **`no_documented_link`** | Aucun | Aucun | Aucun extrait lu ne lie la boîte osseuse ou la mandibule directement à un danger. (Bien que contenant l'appareil oculaire sensible aux radiations, la structure osseuse elle-même n'est pas sourcée). |
| `spine` | `skeletal` | **`no_documented_link`** | Aucun | Aucun | Bien que l'élongation rachidienne en microgravité soit connue en médecine spatiale générale, aucun extrait validé n'est actuellement curé dans `corpus.jsonl`. |
| `ribcage` | `skeletal` | **`no_documented_link`** | Aucun | Aucun | Aucun extrait dans le corpus. |
| `clavicle_scapula` | `skeletal` | **`no_documented_link`** | Aucun | Aucun | Aucun extrait dans le corpus. |
| `pelvis` | `skeletal` | **`no_documented_link`** | Aucun | Aucun | Aucun extrait dans le corpus. |
| `upper_limb_bones` | `skeletal` | **`no_documented_link`** | Aucun | Aucun | Aucun extrait dans le corpus. |
| `lower_limb_bones` | `skeletal` | **`no_documented_link`** | Aucun | Aucun | Aucun extrait dans le corpus. |
| `pectorals_deltoids` | `muscular` | **`no_documented_link`** | Aucun | Aucun | L'atrophie musculaire n'a pas encore d'extrait spécifique curé dans `data/corpus.jsonl`. |
| `abdominals_obliques` | `muscular` | **`no_documented_link`** | Aucun | Aucun | Aucun extrait dans le corpus. |
| `arm_muscles` | `muscular` | **`no_documented_link`** | Aucun | Aucun | Aucun extrait dans le corpus. |
| `leg_muscles` | `muscular` | **`no_documented_link`** | Aucun | Aucun | Aucun extrait dans le corpus. |
| `lungs` | `organs` | **`no_documented_link`** | Aucun | Aucun | Le système respiratoire n'est relié à aucun danger dans le corpus curé actuel. |
| `liver` | `organs` | **`no_documented_link`** | Aucun | Aucun | Le foie n'est mentionné par aucun extrait du corpus. |
| `kidneys` | `organs` | **`no_documented_link`** | Aucun | Aucun | Les reins ne sont mentionnés par aucun extrait du corpus. |
| `intestines` | `organs` | **`no_documented_link`** | Aucun | Aucun | Le système digestif/estomac/intestins n'est mentionné par aucun extrait du corpus. |
| `brain_spinal_cord` | `nervous` | **`no_documented_link`** | Aucun | Aucun | Le corpus mentionne le danger `isolation` sous l'angle `behavioral` (comportemental), et non sous forme d'atteinte tissulaire anatomique neurologique. |
| `peripheral_nerves` | `nervous` | **`no_documented_link`** | Aucun | Aucun | Aucun extrait dans le corpus. |
| `holo_skin` | `skin` | **`no_documented_link`** | Aucun | Aucun | Aucun extrait dans le corpus. |

---

## 4. Analyse des lacunes documentaires (Gaps)

1. **Systèmes sans source dans le corpus actuel :**
   - **Digestif / Métabolique** : foie (`liver`), estomac/intestins (`intestines`), reins (`kidneys`).
   - **Respiratoire** : poumons (`lungs`).
   - **Musculosquelettique** : l'ensemble des 7 zones osseuses et 4 groupes musculaires. Bien que le déconditionnement osseux et musculaire soit un thème central des vols spatiaux, `data/hazard_map.json` et `data/corpus.jsonl` ne disposent d'aucun extrait validé sur ce système.
   - **Tégumentaire** : peau (`holo_skin`).

2. **Systèmes cités dans le corpus mais sans maillage dédié :**
   - **Système hématologique (`hematologic`)** : cité par `csa-space-radiation-effects` et `csa-radi-n2-monitoring` pour les radiations. Il s'agit d'un tissu fluide circulatoire, visualisé en partie par le flux corpusculaire de l'arbre vasculaire.
   - **Système oculaire (`ocular`)** : cité pour les radiations (cataractogénèse, SANS). Il est inclus géométriquement dans la zone `skull`.
   - **Système comportemental (`behavioral`)** : cité par `nasa-hrp-sleep-schedules` et `nasa-hrp-ongoing-cipher` pour l'isolation et la microgravité. Il s'agit d'une fonction cognitive globale et non d'un maillage organique.

3. **Règle de rendu UI dérivée :**
   - Les zones `heart` et `arterial_tree` réagissent dynamiquement aux variations d'exposition à la gravité altérée (`altered_gravity`).
   - Toutes les 18 autres zones restent impérativement grisées avec le libellé explicite :
     *« Aucun lien documenté dans le corpus actuel »*.
