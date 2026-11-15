import { AnatomicalPartInfo } from './types';

export const ANATOMICAL_CATALOG: Record<string, AnatomicalPartInfo> = {
  skull: {
    id: 'skull',
    name: 'Cranium & Mandible',
    latinName: 'Cranium et Mandibula',
    system: 'skeletal',
    region: 'Cephalic',
    summary:
      'Houses and shields the encephalon, cranial sensory organs, and masticatory apparatus via fused neurocranial plates and an articulated mandible.',
    vascularSupply: 'External & Internal Carotid Arteries',
    innervation: 'Trigeminal Nerve (CN V)',
  },
  spine: {
    id: 'spine',
    name: 'Vertebral Column & Sacrum',
    latinName: 'Columna Vertebralis',
    system: 'skeletal',
    region: 'Axial Dorsal',
    summary:
      'Segmented load-bearing column of 24 presacral vertebrae, fibrocartilaginous discs, and fused sacrum protecting the spinal cord.',
    vascularSupply: 'Segmental Spinal & Vertebral Arteries',
    innervation: 'Recurrent Meningeal Nerves',
  },
  ribcage: {
    id: 'ribcage',
    name: 'Thoracic Cage & Sternum',
    latinName: 'Cavea Thoracis',
    system: 'skeletal',
    region: 'Thoracic',
    summary:
      'Twelve bilateral rib pairs, costal arches, and central sternum shielding the heart, great vessels, and lungs while enabling respiratory expansion.',
    vascularSupply: 'Internal Thoracic & Intercostal Arteries',
    innervation: 'Thoracic Intercostal Nerves (T1–T11)',
  },
  clavicle_scapula: {
    id: 'clavicle_scapula',
    name: 'Pectoral Girdle',
    latinName: 'Cingulum Pectorale',
    system: 'skeletal',
    region: 'Shoulder',
    summary:
      'Bilateral clavicles and scapulae anchoring the upper extremities to the axial skeleton and providing wide-arc glenohumeral mobility.',
    vascularSupply: 'Suprascapular & Thoracoacromial Arteries',
    innervation: 'Suprascapular & Lateral Pectoral Nerves',
  },
  pelvis: {
    id: 'pelvis',
    name: 'Pelvic Girdle',
    latinName: 'Cingulum Pelvicum',
    system: 'skeletal',
    region: 'Pelvic',
    summary:
      'Bilateral os coxae (ilium, ischium, pubis) transferring axial trunk loads into the femoral heads while cradling pelvic viscera.',
    vascularSupply: 'Internal & External Iliac Arteries',
    innervation: 'Lumbosacral Plexus',
  },
  upper_limb_bones: {
    id: 'upper_limb_bones',
    name: 'Upper Limb Skeleton',
    latinName: 'Ossa Membri Superioris',
    system: 'skeletal',
    region: 'Brachial & Antebrachial',
    summary:
      'Humerus, supinated radius and ulna, carpals, metacarpals, and phalanges articulated for pronation, supination, and fine prehension.',
    vascularSupply: 'Brachial, Radial & Ulnar Arteries',
    innervation: 'Brachial Plexus (Median, Ulnar, Radial)',
  },
  lower_limb_bones: {
    id: 'lower_limb_bones',
    name: 'Lower Limb Skeleton',
    latinName: 'Ossa Membri Inferioris',
    system: 'skeletal',
    region: 'Femoral & Crural',
    summary:
      'Femur, patella, weight-bearing tibia, lateral fibula, and pedal arches engineered for bipedal locomotion and axial shock absorption.',
    vascularSupply: 'Femoral, Popliteal & Tibial Arteries',
    innervation: 'Femoral & Sciatic Nerve Branches',
  },
  pectorals_deltoids: {
    id: 'pectorals_deltoids',
    name: 'Pectoral & Deltoid Complex',
    latinName: 'Mm. Pectoralis Major et Deltoideus',
    system: 'muscular',
    region: 'Anterior Thorax & Shoulder',
    summary:
      'Convergent striated chest and shoulder musculature driving humeral adduction, flexion, and multi-planar arm abduction.',
    vascularSupply: 'Thoracoacromial & Posterior Circumflex Humeral',
    innervation: 'Medial/Lateral Pectoral & Axillary Nerves',
  },
  abdominals_obliques: {
    id: 'abdominals_obliques',
    name: 'Abdominal Wall Musculature',
    latinName: 'Mm. Rectus Abdominis et Obliqui',
    system: 'muscular',
    region: 'Abdominal',
    summary:
      'Segmented rectus bellies and oblique fiber sheets stabilizing trunk posture, intra-abdominal pressure, and spinal flexion.',
    vascularSupply: 'Superior & Inferior Epigastric Arteries',
    innervation: 'Thoracoabdominal Nerves (T7–T12)',
  },
  arm_muscles: {
    id: 'arm_muscles',
    name: 'Brachial & Forearm Flexors',
    latinName: 'Mm. Biceps Brachii et Antebrachii',
    system: 'muscular',
    region: 'Upper Extremity',
    summary:
      'Fusiform biceps, triceps, and anterior forearm flexors oriented in anatomical supination to flex the elbow, wrist, and digits.',
    vascularSupply: 'Brachial, Radial & Ulnar Arteries',
    innervation: 'Musculocutaneous, Median & Radial Nerves',
  },
  leg_muscles: {
    id: 'leg_muscles',
    name: 'Quadriceps & Crural Complex',
    latinName: 'Mm. Quadriceps Femoris et Triceps Surae',
    system: 'muscular',
    region: 'Lower Extremity',
    summary:
      'High-torque extensor and plantar-flexor fiber bundles generating knee extension, stance stability, and propulsion.',
    vascularSupply: 'Profunda Femoris & Posterior Tibial Arteries',
    innervation: 'Femoral & Tibial Nerves',
  },
  heart: {
    id: 'heart',
    name: 'Heart & Great Vessels',
    latinName: 'Cor et Vasa Majora',
    system: 'cardiovascular',
    region: 'Middle Mediastinum',
    summary:
      'Four-chambered muscular pump positioned slightly left of midline with coronary vessels, aortic arch, and pulmonary trunk exhibiting subtle physiological contraction.',
    vascularSupply: 'Left & Right Coronary Arteries',
    innervation: 'Cardiac Autonomic Plexus (Vagus & Sympathetic)',
  },
  lungs: {
    id: 'lungs',
    name: 'Lungs & Bronchial Tree',
    latinName: 'Pulmones et Arbor Bronchialis',
    system: 'organs',
    region: 'Thoracic Cavity',
    summary:
      'Bilateral spongy respiratory organs (three-lobed right lung, two-lobed left lung with cardiac notch) housing branching cartilaginous bronchi.',
    vascularSupply: 'Pulmonary & Bronchial Arteries',
    innervation: 'Pulmonary Plexus (Vagus & Sympathetic)',
  },
  liver: {
    id: 'liver',
    name: 'Liver',
    latinName: 'Hepar',
    system: 'organs',
    region: 'Right Upper Quadrant',
    summary:
      'Wedge-shaped metabolic gland tucked beneath the right hemidiaphragm, divided into a broad right lobe and tapered left lobe.',
    vascularSupply: 'Hepatic Artery Proper & Portal Vein',
    innervation: 'Hepatic Plexus (Celiac & Vagus)',
  },
  kidneys: {
    id: 'kidneys',
    name: 'Kidneys & Ureters',
    latinName: 'Renes et Ureteres',
    system: 'organs',
    region: 'Retroperitoneal Lumbar',
    summary:
      'Paired bean-shaped filtration organs flanking the lumbar spine (right slightly inferior beneath the liver), draining via slender ureters.',
    vascularSupply: 'Left & Right Renal Arteries',
    innervation: 'Renal Autonomic Plexus (T10–L1)',
  },
  intestines: {
    id: 'intestines',
    name: 'Small & Large Intestines',
    latinName: 'Intestinum Tenue et Crassum',
    system: 'organs',
    region: 'Abdominopelvic Cavity',
    summary:
      'Convoluted jejunoileal loops framed by the ascending, transverse, descending, and sigmoid colon for nutrient and water absorption.',
    vascularSupply: 'Superior & Inferior Mesenteric Arteries',
    innervation: 'Enteric & Mesenteric Autonomic Plexuses',
  },
  arterial_tree: {
    id: 'arterial_tree',
    name: 'Systemic Vascular Network',
    latinName: 'Systema Vasculare',
    system: 'cardiovascular',
    region: 'Full-Body Systemic',
    summary:
      'Dense paired arterial (oxygenated red) and venous (deoxygenated blue) vessels branching across the torso, viscera, and upper/lower extremities.',
    vascularSupply: 'Vasa Vasorum',
    innervation: 'Sympathetic Vasomotor Fibers',
  },
  brain_spinal_cord: {
    id: 'brain_spinal_cord',
    name: 'Encephalon & Spinal Cord',
    latinName: 'Systema Nervosum Centrale',
    system: 'nervous',
    region: 'Cranial & Vertebral Canal',
    summary:
      'Folded cerebral hemispheres, striated cerebellum, brainstem, and descending spinal tracts coordinating somatic and autonomic signaling.',
    vascularSupply: 'Circle of Willis & Spinal Arteries',
    innervation: 'Central Nervous System',
  },
  peripheral_nerves: {
    id: 'peripheral_nerves',
    name: 'Peripheral Nerve Plexuses',
    latinName: 'Plexus Brachialis et Lumbosacralis',
    system: 'nervous',
    region: 'Cervical, Thoracic & Extremities',
    summary:
      'Delicate cyan neural pathways radiating from spinal roots through brachial, intercostal, and sciatic trunks to distal effectors.',
    vascularSupply: 'Vasa Nervorum',
    innervation: 'Somatic & Autonomic Pathways',
  },
  holo_skin: {
    id: 'holo_skin',
    name: 'Cutaneous Holographic Envelope',
    latinName: 'Integumentum Commune',
    system: 'skin',
    region: 'External Surface',
    summary:
      'Translucent volumetric surface mesh defining anatomical surface landmarks, body contour proportions, and diagnostic alignment.',
    vascularSupply: 'Cutaneous Subdermal Plexus',
    innervation: 'Cutaneous Sensory Dermatomes',
  },
};
