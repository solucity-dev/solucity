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
  ],

  seguridad: [
    { id: 'camaras-y-alarmas', title: 'Cámaras y alarmas', icon: { set: 'mdi', name: 'cctv' } },
    { id: 'cerrajeria', title: 'Cerrajería', icon: { set: 'mdi', name: 'key-variant' } },
    {
      id: 'personal-de-seguridad',
      title: 'Personal de seguridad',
      icon: { set: 'mdi', name: 'shield-account-outline' },
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

    { id: 'fletes', title: 'Fletes', icon: { set: 'mdi', name: 'truck-fast-outline' } },
    {
      id: 'diseno-de-interiores',
      title: 'Diseño de interiores',
      icon: { set: 'mdi', name: 'sofa' }, // o 'palette-swatch'
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
  ],

  profesionales: [
    { id: 'abogado', title: 'Abogado', icon: { set: 'mdi', name: 'scale-balance' } },
    { id: 'contador', title: 'Contador', icon: { set: 'mdi', name: 'calculator' } },
    { id: 'escribano', title: 'Escribano', icon: { set: 'mdi', name: 'file-sign' } },
    { id: 'arquitecto', title: 'Arquitecto', icon: { set: 'mdi', name: 'compass-outline' } },
    { id: 'ingeniero', title: 'Ingeniero', icon: { set: 'mdi', name: 'cog-outline' } },
  ],
};
