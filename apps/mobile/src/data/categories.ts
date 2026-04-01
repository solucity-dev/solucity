// apps/mobile/src/data/categories.ts
import type { RootCategoryId } from '../types';

type IconSpec = { set: 'ion' | 'mdi'; name: string };
export type Subcategory = { id: string; title: string; icon: IconSpec };

export const ROOT_CATEGORIES: { id: RootCategoryId; title: string; icon: IconSpec }[] = [
  {
    id: 'construccion-mantenimiento',
    title: 'Construcción y mantenimiento',
    icon: { set: 'mdi', name: 'hammer-screwdriver' },
  },
  {
    id: 'informatica-electronica',
    title: 'Informática y electrónica',
    icon: { set: 'mdi', name: 'laptop' },
  },
  {
    id: 'seguridad',
    title: 'Seguridad',
    icon: { set: 'mdi', name: 'shield-lock-outline' },
  },
  {
    id: 'servicios',
    title: 'Servicios',
    icon: { set: 'mdi', name: 'hand-heart-outline' },
  },
  {
    id: 'salud',
    title: 'Salud',
    icon: { set: 'mdi', name: 'hospital-box-outline' },
  },
  {
    id: 'holistico-bienestar',
    title: 'Holístico y bienestar',
    icon: { set: 'mdi', name: 'meditation' },
  },
  {
    id: 'digital',
    title: 'Digital',
    icon: { set: 'mdi', name: 'monitor-dashboard' },
  },
  {
    id: 'profesionales',
    title: 'Profesionales',
    icon: { set: 'mdi', name: 'briefcase-account' },
  },
  {
    id: 'estetica',
    title: 'Estética',
    icon: { set: 'mdi', name: 'face-woman-shimmer' },
  },
  {
    id: 'transporte',
    title: 'Transporte',
    icon: { set: 'mdi', name: 'car-multiple' },
  },
  {
    id: 'arreglos-reparaciones',
    title: 'Arreglos y reparaciones',
    icon: { set: 'mdi', name: 'wrench-cog' },
  },
  {
    id: 'consultoria-desarrollo-profesional',
    title: 'Consultoría',
    icon: { set: 'mdi', name: 'briefcase-outline' },
  },
  {
    id: 'alquiler',
    title: 'Alquiler',
    icon: { set: 'mdi', name: 'tools' },
  },
];

// Mapa (cómodo para lookup por id)
export const ROOT_CATEGORY_MAP: Record<
  RootCategoryId,
  { id: RootCategoryId; title: string; icon: IconSpec }
> = ROOT_CATEGORIES.reduce(
  (acc, c) => {
    acc[c.id] = c;
    return acc;
  },
  {} as Record<RootCategoryId, { id: RootCategoryId; title: string; icon: IconSpec }>,
);

export const SUBCATEGORIES: Record<RootCategoryId, Subcategory[]> = {
  'construccion-mantenimiento': [
    { id: 'albanileria', title: 'Albañilería', icon: { set: 'mdi', name: 'wall' } },
    { id: 'electricidad', title: 'Electricidad', icon: { set: 'mdi', name: 'lightning-bolt' } },
    { id: 'yeseria-durlock', title: 'Yesería / Durlock', icon: { set: 'mdi', name: 'saw-blade' } },
    { id: 'carpinteria', title: 'Carpintería', icon: { set: 'mdi', name: 'ruler-square' } },
    { id: 'herreria', title: 'Herrería', icon: { set: 'mdi', name: 'anvil' } },
    { id: 'plomeria', title: 'Plomero', icon: { set: 'mdi', name: 'pipe-wrench' } },
    {
      id: 'plomeria-gasista',
      title: 'Gasista',
      icon: { set: 'mdi', name: 'fire-circle' },
    },
    { id: 'pintura', title: 'Pintura', icon: { set: 'mdi', name: 'format-paint' } },
    { id: 'jardineria', title: 'Jardinería', icon: { set: 'mdi', name: 'shovel' } },
    { id: 'piscinas', title: 'Piscinas', icon: { set: 'mdi', name: 'pool' } },
    {
      id: 'desagote-y-banos-quimicos',
      title: 'Desagote y baños químicos',
      icon: { set: 'mdi', name: 'toilet' },
    },
    { id: 'soldador', title: 'Soldador', icon: { set: 'mdi', name: 'torch' } },
    {
      id: 'porcelanato-liquido',
      title: 'Porcelanato líquido',
      icon: { set: 'mdi', name: 'floor-plan' },
    },
    { id: 'vidrieria', title: 'Vidriería', icon: { set: 'mdi', name: 'glass-fragile' } },
    { id: 'aberturas', title: 'Aberturas', icon: { set: 'mdi', name: 'door' } },
    { id: 'impermeabilizacion', title: 'Impermeabilización', icon: { set: 'mdi', name: 'water' } },
    { id: 'zingueria', title: 'Zinguería', icon: { set: 'mdi', name: 'home-roof' } },
    { id: 'tapizado', title: 'Tapizado', icon: { set: 'mdi', name: 'sofa-single' } },
  ],

  'informatica-electronica': [
    { id: 'climatizacion', title: 'Climatización', icon: { set: 'mdi', name: 'air-conditioner' } },
    {
      id: 'servicio-tecnico-electronica',
      title: 'Servicio técnico (electrónica)',
      icon: { set: 'mdi', name: 'resistor' },
    },
    {
      id: 'servicio-tecnico-electrodomesticos',
      title: 'Servicio técnico (electrodomésticos)',
      icon: { set: 'mdi', name: 'washing-machine' },
    },
    {
      id: 'servicio-tecnico-informatica',
      title: 'Servicio técnico (informática)',
      icon: { set: 'mdi', name: 'desktop-classic' },
    },
    { id: 'carteleria', title: 'Cartelería', icon: { set: 'mdi', name: 'sign-text' } },
    {
      id: 'reparacion-de-celulares',
      title: 'Reparación de celulares',
      icon: { set: 'mdi', name: 'cellphone' },
    },
    {
      id: 'servicio-tecnico-audiovisual',
      title: 'Servicio técnico (audiovisual)',
      icon: { set: 'mdi', name: 'television' },
    },
  ],

  seguridad: [
    { id: 'camaras-y-alarmas', title: 'Cámaras y alarmas', icon: { set: 'mdi', name: 'cctv' } },
    { id: 'cerrajeria', title: 'Cerrajería', icon: { set: 'mdi', name: 'key-variant' } },
    {
      id: 'personal-de-seguridad',
      title: 'Personal de seguridad',
      icon: { set: 'mdi', name: 'shield-account-outline' },
    },
    {
      id: 'cercos-electricos-perimetrales',
      title: 'Cercos eléctricos / perimetrales',
      icon: { set: 'mdi', name: 'electric-switch' },
    },
  ],

  servicios: [
    { id: 'limpieza', title: 'Limpieza', icon: { set: 'mdi', name: 'broom' } },
    {
      id: 'clases-particulares',
      title: 'Clases particulares',
      icon: { set: 'mdi', name: 'book-open-variant' },
    },
    { id: 'paseador-de-perros', title: 'Paseador de perros', icon: { set: 'mdi', name: 'dog' } },
    { id: 'cuidado-de-mascotas', title: 'Cuidado de mascotas', icon: { set: 'mdi', name: 'paw' } },
    {
      id: 'organizacion-de-eventos',
      title: 'Organización de eventos',
      icon: { set: 'mdi', name: 'calendar-star' },
    },
    { id: 'fotografia-y-video', title: 'Fotografía y video', icon: { set: 'mdi', name: 'camera' } },
    {
      id: 'diseno-de-interiores',
      title: 'Diseño de interiores',
      icon: { set: 'mdi', name: 'sofa' },
    },
    {
      id: 'atencion-al-cliente',
      title: 'Atención al cliente',
      icon: { set: 'mdi', name: 'account-voice' },
    },
    {
      id: 'lavanderia',
      title: 'Lavandería',
      icon: { set: 'mdi', name: 'washing-machine' },
    },
  ],

  salud: [
    {
      id: 'acompanante-terapeutico',
      title: 'Acompañante terapéutico',
      icon: { set: 'mdi', name: 'hand-heart' },
    },
    {
      id: 'psicologo',
      title: 'Psicólogo',
      icon: { set: 'mdi', name: 'head-heart-outline' },
    },
    {
      id: 'psiquiatra',
      title: 'Psiquiatra',
      icon: { set: 'mdi', name: 'stethoscope' },
    },
    {
      id: 'asistencia-medica',
      title: 'Asistencia médica',
      icon: { set: 'mdi', name: 'medical-bag' },
    },
    {
      id: 'nutricionista',
      title: 'Nutricionista',
      icon: { set: 'mdi', name: 'food-apple' },
    },
    {
      id: 'psicopedagoga',
      title: 'Psicopedagoga',
      icon: { set: 'mdi', name: 'school-outline' },
    },
    {
      id: 'kinesiologia',
      title: 'Kinesiología',
      icon: { set: 'mdi', name: 'arm-flex-outline' },
    },
    {
      id: 'cuidador-de-pacientes',
      title: 'Cuidador de pacientes',
      icon: { set: 'mdi', name: 'account-heart-outline' },
    },
    {
      id: 'podologia',
      title: 'Podología',
      icon: { set: 'mdi', name: 'foot-print' },
    },
  ],

  'holistico-bienestar': [
    { id: 'reiki', title: 'Reiki', icon: { set: 'mdi', name: 'hands-pray' } },
    { id: 'yoga', title: 'Yoga', icon: { set: 'mdi', name: 'yoga' } },
    {
      id: 'meditacion-guiada',
      title: 'Meditación guiada',
      icon: { set: 'mdi', name: 'meditation' },
    },
    {
      id: 'terapias-holisticas',
      title: 'Terapias holísticas',
      icon: { set: 'mdi', name: 'leaf-circle-outline' },
    },
    {
      id: 'masajes-holisticos',
      title: 'Masajes holísticos',
      icon: { set: 'mdi', name: 'spa' },
    },
  ],

  digital: [
    {
      id: 'marketing-digital',
      title: 'Marketing digital',
      icon: { set: 'mdi', name: 'bullhorn-outline' },
    },
    {
      id: 'diseno-grafico',
      title: 'Diseño gráfico',
      icon: { set: 'mdi', name: 'palette-outline' },
    },
    {
      id: 'diseno-de-logos',
      title: 'Diseño de logos',
      icon: { set: 'mdi', name: 'shape-outline' },
    },
    {
      id: 'community-manager',
      title: 'Community manager',
      icon: { set: 'mdi', name: 'account-group-outline' },
    },
    {
      id: 'desarrollo-web',
      title: 'Desarrollo web',
      icon: { set: 'mdi', name: 'web' },
    },
    {
      id: 'registro-de-marcas',
      title: 'Registro de marcas',
      icon: { set: 'ion', name: 'pricetag-outline' },
    },
  ],

  profesionales: [
    { id: 'abogado', title: 'Abogado', icon: { set: 'mdi', name: 'scale-balance' } },
    { id: 'contador', title: 'Contador', icon: { set: 'mdi', name: 'calculator' } },
    { id: 'escribano', title: 'Escribano', icon: { set: 'mdi', name: 'file-sign' } },
    { id: 'arquitecto', title: 'Arquitecto', icon: { set: 'mdi', name: 'compass-outline' } },
    { id: 'ingeniero', title: 'Ingeniero', icon: { set: 'mdi', name: 'cog-outline' } },
    {
      id: 'pas-productor-asesor-de-seguros',
      title: 'PAS - Productor asesor de seguros',
      icon: { set: 'mdi', name: 'shield-check-outline' },
    },
    {
      id: 'mandatario-del-automotor',
      title: 'Mandatario del automotor',
      icon: { set: 'mdi', name: 'file-document-edit-outline' },
    },
  ],

  estetica: [
    { id: 'peluqueria', title: 'Peluquería', icon: { set: 'mdi', name: 'content-cut' } },
    { id: 'barberia', title: 'Barbería', icon: { set: 'mdi', name: 'mustache' } },
    {
      id: 'manicuria-unas',
      title: 'Manicuría / Uñas',
      icon: { set: 'mdi', name: 'nail' },
    },
    { id: 'maquillaje', title: 'Maquillaje', icon: { set: 'mdi', name: 'brush' } },
    { id: 'depilacion', title: 'Depilación', icon: { set: 'mdi', name: 'razor-double-edge' } },
    { id: 'cosmetologia', title: 'Cosmetología', icon: { set: 'mdi', name: 'lotion' } },
    { id: 'masajes', title: 'Masajes', icon: { set: 'mdi', name: 'spa-outline' } },
    {
      id: 'spa-estetica-corporal',
      title: 'Spa / Estética corporal',
      icon: { set: 'mdi', name: 'flower-tulip-outline' },
    },
    {
      id: 'cejas-y-pestanas',
      title: 'Cejas y pestañas',
      icon: { set: 'mdi', name: 'eye-outline' },
    },
    {
      id: 'tatuajes',
      title: 'Tatuajes',
      icon: { set: 'mdi', name: 'needle' },
    },
    {
      id: 'piercing',
      title: 'Piercing',
      icon: { set: 'mdi', name: 'circle-outline' },
    },
  ],

  transporte: [
    {
      id: 'traslado-de-pasajeros',
      title: 'Traslado de pasajeros',
      icon: { set: 'mdi', name: 'car-seat' },
    },
    {
      id: 'chofer-particular',
      title: 'Chofer particular',
      icon: { set: 'mdi', name: 'steering' },
    },
    {
      id: 'fletes',
      title: 'Fletes',
      icon: { set: 'mdi', name: 'truck-fast-outline' },
    },
    {
      id: 'auxilio-vehicular',
      title: 'Auxilio vehicular',
      icon: { set: 'mdi', name: 'car-wrench' },
    },
    {
      id: 'reparacion-de-bicicletas',
      title: 'Reparación de bicicletas',
      icon: { set: 'mdi', name: 'bike' },
    },
    {
      id: 'mecanico-automotor',
      title: 'Mecánico automotor',
      icon: { set: 'mdi', name: 'engine' },
    },
    {
      id: 'electricidad-del-automotor',
      title: 'Electricidad del automotor',
      icon: { set: 'mdi', name: 'car-electric' },
    },
    {
      id: 'mecanica-de-motos',
      title: 'Mecánica de motos',
      icon: { set: 'mdi', name: 'motorbike' },
    },
    {
      id: 'gomeria',
      title: 'Gomería',
      icon: { set: 'mdi', name: 'car-tire-alert' },
    },
    {
      id: 'car-detailing',
      title: 'Car detailing',
      icon: { set: 'mdi', name: 'car-wash' },
    },
    {
      id: 'lavadero-de-autos',
      title: 'Lavadero de autos',
      icon: { set: 'mdi', name: 'spray' },
    },
  ],

  'arreglos-reparaciones': [
    {
      id: 'reparacion-de-calzado',
      title: 'Reparación de calzado',
      icon: { set: 'mdi', name: 'shoe-formal' },
    },
    {
      id: 'arreglos-de-indumentaria',
      title: 'Arreglos de indumentaria',
      icon: { set: 'mdi', name: 'hanger' },
    },
    {
      id: 'costura-modista',
      title: 'Costura / Modista',
      icon: { set: 'ion', name: 'shirt-outline' },
    },
  ],

  'consultoria-desarrollo-profesional': [
    {
      id: 'asesor-empresarial',
      title: 'Asesor empresarial',
      icon: { set: 'mdi', name: 'office-building-cog-outline' },
    },
    {
      id: 'coach-ejecutivo',
      title: 'Coach ejecutivo',
      icon: { set: 'mdi', name: 'account-tie-outline' },
    },
    {
      id: 'coach-organizacional',
      title: 'Coach organizacional',
      icon: { set: 'mdi', name: 'account-group-outline' },
    },
    {
      id: 'coach-ontologico',
      title: 'Coach ontológico',
      icon: { set: 'mdi', name: 'head-cog-outline' },
    },
    {
      id: 'mentoria',
      title: 'Mentoría',
      icon: { set: 'mdi', name: 'school-outline' },
    },
    {
      id: 'consultor-de-negocios',
      title: 'Consultor de negocios',
      icon: { set: 'mdi', name: 'chart-line' },
    },
  ],
  alquiler: [
    {
      id: 'alquiler-de-herramientas',
      title: 'Alquiler de herramientas',
      icon: { set: 'mdi', name: 'tools' },
    },
    {
      id: 'alquiler-de-maquinaria-liviana',
      title: 'Alquiler de maquinaria liviana',
      icon: { set: 'mdi', name: 'engine-outline' },
    },
    {
      id: 'alquiler-de-maquinaria-pesada',
      title: 'Alquiler de maquinaria pesada',
      icon: { set: 'mdi', name: 'excavator' },
    },
    {
      id: 'alquiler-de-generadores',
      title: 'Alquiler de generadores',
      icon: { set: 'mdi', name: 'generator-portable' },
    },
    {
      id: 'alquiler-de-andamios',
      title: 'Alquiler de andamios',
      icon: { set: 'mdi', name: 'ladder' },
    },
    {
      id: 'alquiler-de-hidrolavadoras',
      title: 'Alquiler de hidrolavadoras',
      icon: { set: 'mdi', name: 'spray-bottle' },
    },
    {
      id: 'alquiler-de-hormigoneras',
      title: 'Alquiler de hormigoneras',
      icon: { set: 'mdi', name: 'truck-cargo-container' },
    },
    {
      id: 'alquiler-de-elevadores',
      title: 'Alquiler de elevadores',
      icon: { set: 'mdi', name: 'elevator' },
    },
    {
      id: 'alquiler-de-equipos-de-sonido-e-iluminacion',
      title: 'Alquiler de equipos de sonido e iluminación',
      icon: { set: 'mdi', name: 'speaker-wireless' },
    },
    {
      id: 'alquiler-de-carpas-y-mobiliario',
      title: 'Alquiler de carpas y mobiliario',
      icon: { set: 'mdi', name: 'table-furniture' },
    },
  ],
};
