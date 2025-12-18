// src/data/categories.ts
import type { RootCategoryId } from '../types';

type IconSpec = { set: 'ion' | 'mdi'; name: string }
export type Subcategory = { id: string; title: string; icon: IconSpec }

export const ROOT_CATEGORIES: { id: RootCategoryId; title: string; icon: IconSpec }[] = [
  { id: 'construccion-mantenimiento', title: 'Construcción y mantenimiento', icon: { set: 'mdi', name: 'hammer-screwdriver' } },
  { id: 'informatica-electronica',    title: 'Informática y electrónica',   icon: { set: 'mdi', name: 'laptop' } },
  { id: 'seguridad',                  title: 'Seguridad',                    icon: { set: 'mdi', name: 'shield-lock-outline' } },
  { id: 'servicios',                  title: 'Servicios',                    icon: { set: 'mdi', name: 'hand-heart-outline' } },
]

// Mapa (cómodo para lookup por id)
export const ROOT_CATEGORY_MAP: Record<RootCategoryId, { id: RootCategoryId; title: string; icon: IconSpec }> =
  ROOT_CATEGORIES.reduce((acc, c) => { acc[c.id] = c; return acc }, {} as any)

export const SUBCATEGORIES: Record<RootCategoryId, Subcategory[]> = {
  'construccion-mantenimiento': [
    { id: 'albanileria',      title: 'Albañilería',       icon: { set: 'mdi', name: 'wall' } },
    { id: 'electricidad',     title: 'Electricidad',      icon: { set: 'mdi', name: 'lightning-bolt' } },
    { id: 'yeseria-durlock',  title: 'Yesería / Durlock', icon: { set: 'mdi', name: 'saw-blade' } },
    { id: 'carpinteria',      title: 'Carpintería',       icon: { set: 'mdi', name: 'ruler-square' } },
    { id: 'herreria',         title: 'Herrería',          icon: { set: 'mdi', name: 'anvil' } },
    { id: 'plomeria',         title: 'Plomería',          icon: { set: 'mdi', name: 'pipe-wrench' } },
    { id: 'pintura',          title: 'Pintura',           icon: { set: 'mdi', name: 'format-paint' } },
    { id: 'jardineria',       title: 'Jardinería',        icon: { set: 'mdi', name: 'shovel' } },
    { id: 'piscinas',         title: 'Piscinas',          icon: { set: 'mdi', name: 'pool' } },
  ],
  'informatica-electronica': [
    { id: 'aire-acond',       title: 'Climatización',                       icon: { set: 'mdi', name: 'air-conditioner' } },
    { id: 'st-electronica',   title: 'Servicio técnico (electrónica)',           icon: { set: 'mdi', name: 'resistor' } },
    { id: 'st-electrodom',    title: 'Servicio técnico (electrodomésticos)',     icon: { set: 'mdi', name: 'washing-machine' } },
    { id: 'st-informatica',   title: 'Servicio técnico (informática)',           icon: { set: 'mdi', name: 'desktop-classic' } },
  ],
  'seguridad': [
    { id: 'camaras-alarmas',  title: 'Cámaras y alarmas',     icon: { set: 'mdi', name: 'cctv' } },
    { id: 'cerrajeria',       title: 'Cerrajería',            icon: { set: 'mdi', name: 'key-variant' } },
    { id: 'personal-seg',     title: 'Personal de seguridad', icon: { set: 'mdi', name: 'shield-account-outline' } },
  ],
  'servicios': [
    { id: 'limpieza',         title: 'Limpieza',                  icon: { set: 'mdi', name: 'broom' } },
    { id: 'acompanante-ter',  title: 'Acompañante terapéutico',   icon: { set: 'mdi', name: 'hand-heart' } },
    { id: 'clases-part',      title: 'Clases particulares',       icon: { set: 'mdi', name: 'book-open-variant' } },
    { id: 'paseador-perros',  title: 'Paseador de perros',        icon: { set: 'mdi', name: 'dog' } },
  ],
}

