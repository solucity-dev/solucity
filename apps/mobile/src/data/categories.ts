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
  { id: 'seguridad', title: 'Seguridad', icon: { set: 'mdi', name: 'shield-lock-outline' } },
  { id: 'servicios', title: 'Servicios', icon: { set: 'mdi', name: 'hand-heart-outline' } },
  {
    id: 'gastronomia',
    title: 'Gastronomía',
    icon: { set: 'mdi', name: 'silverware-fork-knife' },
  },
  {
    id: 'profesionales',
    title: 'Profesionales',
    icon: { set: 'mdi', name: 'briefcase-account' },
  },
  {
    id: 'estetica',
    title: 'Estética',
    icon: { set: 'mdi', name: 'face-woman-shimmer' }, // alternativa: 'content-cut' o 'spa'
  },
  {
    id: 'alquiler',
    title: 'Alquiler',
    icon: { set: 'mdi', name: 'warehouse' },
  },
];

// Mapa (cómodo para lookup por id)
export const ROOT_CATEGORY_MAP: Record<
  RootCategoryId,
  { id: RootCategoryId; title: string; icon: IconSpec }
> = ROOT_CATEGORIES.reduce((acc, c) => {
  acc[c.id] = c;
  return acc;
}, {} as any);

export const SUBCATEGORIES: Record<RootCategoryId, Subcategory[]> = {
  'construccion-mantenimiento': [
    { id: 'albanileria', title: 'Albañilería', icon: { set: 'mdi', name: 'wall' } },
    { id: 'electricidad', title: 'Electricidad', icon: { set: 'mdi', name: 'lightning-bolt' } },
    { id: 'yeseria-durlock', title: 'Yesería / Durlock', icon: { set: 'mdi', name: 'saw-blade' } },
    { id: 'carpinteria', title: 'Carpintería', icon: { set: 'mdi', name: 'ruler-square' } },
    { id: 'herreria', title: 'Herrería', icon: { set: 'mdi', name: 'anvil' } },

    // ✅ slug real del backend
    {
      id: 'plomeria-gasista',
      title: 'Plomería / Gasista',
      icon: { set: 'mdi', name: 'pipe-wrench' },
    },

    { id: 'pintura', title: 'Pintura', icon: { set: 'mdi', name: 'format-paint' } },
    { id: 'jardineria', title: 'Jardinería', icon: { set: 'mdi', name: 'shovel' } },
    { id: 'piscinas', title: 'Piscinas', icon: { set: 'mdi', name: 'pool' } },
    {
      id: 'desagote-y-banos-quimicos',
      title: 'Desagote y baños químicos',
      icon: { set: 'mdi', name: 'toilet' }, // o 'truck-water' si preferís
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
  ],

  'informatica-electronica': [
    // ✅ Climatización va acá (NO en construcción)
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
      id: 'acompanante-terapeutico',
      title: 'Acompañante terapéutico',
      icon: { set: 'mdi', name: 'hand-heart' },
    },
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

    { id: 'fletes', title: 'Fletes', icon: { set: 'mdi', name: 'truck-fast-outline' } },
    {
      id: 'diseno-de-interiores',
      title: 'Diseño de interiores',
      icon: { set: 'mdi', name: 'sofa' }, // o 'palette-swatch'
    },
    {
      id: 'atencion-al-cliente',
      title: 'Atención al cliente',
      icon: { set: 'mdi', name: 'account-voice' },
    },
  ],

  gastronomia: [
    { id: 'camarero-mozo', title: 'Camarero / Mozo', icon: { set: 'mdi', name: 'account-tie' } },
    { id: 'cocinero', title: 'Cocinero', icon: { set: 'mdi', name: 'chef-hat' } },
    { id: 'bartender', title: 'Bartender', icon: { set: 'mdi', name: 'glass-cocktail' } },
    { id: 'catering', title: 'Catering', icon: { set: 'mdi', name: 'food' } },
    {
      id: 'ayudante-de-cocina',
      title: 'Ayudante de cocina',
      icon: { set: 'mdi', name: 'silverware' },
    },
    {
      id: 'bachero',
      title: 'Bachero',
      icon: { set: 'mdi', name: 'dishwasher' }, // si no existe, usá 'silverware-clean' o 'broom'
    },
  ],

  profesionales: [
    { id: 'abogado', title: 'Abogado', icon: { set: 'mdi', name: 'scale-balance' } },
    { id: 'contador', title: 'Contador', icon: { set: 'mdi', name: 'calculator' } },
    { id: 'escribano', title: 'Escribano', icon: { set: 'mdi', name: 'file-sign' } },
    { id: 'arquitecto', title: 'Arquitecto', icon: { set: 'mdi', name: 'compass-outline' } },
    { id: 'ingeniero', title: 'Ingeniero', icon: { set: 'mdi', name: 'cog-outline' } },
    { id: 'psicologo', title: 'Psicólogo', icon: { set: 'mdi', name: 'brain' } }, // alternativa: 'head-heart-outline'
    { id: 'psiquiatra', title: 'Psiquiatra', icon: { set: 'mdi', name: 'hospital-box-outline' } },
  ],

  estetica: [
    { id: 'peluqueria', title: 'Peluquería', icon: { set: 'mdi', name: 'content-cut' } },
    { id: 'barberia', title: 'Barbería', icon: { set: 'mdi', name: 'mustache' } },
    {
      id: 'manicuria-unas',
      title: 'Manicuría / Uñas',
      icon: { set: 'mdi', name: 'hand-sparkles' },
    },
    { id: 'maquillaje', title: 'Maquillaje', icon: { set: 'mdi', name: 'brush' } },
    { id: 'depilacion', title: 'Depilación', icon: { set: 'mdi', name: 'razor-double-edge' } },
    { id: 'cosmetologia', title: 'Cosmetología', icon: { set: 'mdi', name: 'lotion' } },
    { id: 'masajes', title: 'Masajes', icon: { set: 'mdi', name: 'massage' } },
    {
      id: 'spa-estetica-corporal',
      title: 'Spa / Estética corporal',
      icon: { set: 'mdi', name: 'spa-outline' },
    },
    {
      id: 'cejas-y-pestanas',
      title: 'Cejas y pestañas',
      icon: { set: 'mdi', name: 'eye-outline' },
    },
  ],

  alquiler: [
    {
      id: 'alquiler-de-herramientas',
      title: 'Alquiler de herramientas',
      icon: { set: 'mdi', name: 'toolbox-outline' },
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
      icon: { set: 'mdi', name: 'generator-mobile' },
    },
    {
      id: 'alquiler-de-andamios',
      title: 'Alquiler de andamios',
      icon: { set: 'mdi', name: 'stairs' },
    },
    {
      id: 'alquiler-de-hidrolavadoras',
      title: 'Alquiler de hidrolavadoras',
      icon: { set: 'mdi', name: 'water-pump' },
    },
    {
      id: 'alquiler-de-hormigoneras',
      title: 'Alquiler de hormigoneras',
      icon: { set: 'mdi', name: 'truck-mixer' },
    },
    {
      id: 'alquiler-de-elevadores',
      title: 'Alquiler de elevadores',
      icon: { set: 'mdi', name: 'elevator' },
    },
    {
      id: 'alquiler-de-equipos-de-sonido-e-iluminacion',
      title: 'Alquiler de sonido e iluminación',
      icon: { set: 'mdi', name: 'speaker-multiple' },
    },
    {
      id: 'alquiler-de-carpas-y-mobiliario',
      title: 'Alquiler de carpas y mobiliario',
      icon: { set: 'mdi', name: 'tent' },
    },
  ],
};
