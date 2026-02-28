// src/types.ts

/** Grupos raíz para la grilla principal */
export type RootCategoryId =
  | 'construccion-mantenimiento'
  | 'informatica-electronica'
  | 'seguridad'
  | 'servicios'
  | 'gastronomia'
  | 'profesionales'
  | 'estetica'
  | 'alquiler';
/**
 * Slugs de rubros (categorías hijas).
 * ✅ Regla: minúsculas, sin tildes, sin espacios, sin "/" y con guiones.
 */

/**
 * Slugs de rubros (categorías hijas).
 * ✅ Regla: minúsculas, sin tildes, sin espacios, sin "/" y con guiones.
 */
export type CategorySlug =
  // ── Construcción & Mantenimiento ──────────────────────────
  | 'albanileria'
  | 'electricidad'
  | 'yeseria-durlock'
  | 'carpinteria'
  | 'herreria'
  | 'plomeria-gasista'
  | 'pintura'
  | 'jardineria'
  | 'piscinas'
  | 'desagote-y-banos-quimicos'
  | 'soldador'
  | 'porcelanato-liquido'
  | 'vidrieria'
  | 'aberturas'
  | 'impermeabilizacion'
  | 'zingueria'
  // ── Informática & Electrónica ─────────────────────────────
  | 'climatizacion'
  | 'servicio-tecnico-electronica'
  | 'servicio-tecnico-electrodomesticos'
  | 'servicio-tecnico-informatica'
  | 'carteleria'
  | 'reparacion-de-celulares'
  | 'servicio-tecnico-audiovisual'
  // ── Seguridad ─────────────────────────────────────────────
  | 'cerrajeria'
  | 'camaras-y-alarmas'
  | 'personal-de-seguridad'
  | 'cercos-electricos-perimetrales'
  // ── Servicios Generales ───────────────────────────────────
  | 'limpieza'
  | 'clases-particulares'
  | 'paseador-de-perros'
  | 'acompanante-terapeutico'
  | 'fletes'
  | 'diseno-de-interiores'
  | 'cuidado-de-mascotas'
  | 'organizacion-de-eventos'
  | 'fotografia-y-video'
  | 'atencion-al-cliente'
  // ── Gastronomía ───────────────────────────────────────────
  | 'camarero-mozo'
  | 'cocinero'
  | 'bartender'
  | 'catering'
  | 'ayudante-de-cocina'
  | 'bachero'
  // ── Profesionales ─────────────────────────────────────────
  | 'abogado'
  | 'contador'
  | 'escribano'
  | 'arquitecto'
  | 'ingeniero'
  | 'psicologo'
  | 'psiquiatra'
  // ── Estética ──────────────────────────────────────────────
  | 'peluqueria'
  | 'barberia'
  | 'manicuria-unas'
  | 'maquillaje'
  | 'depilacion'
  | 'cosmetologia'
  | 'masajes'
  | 'spa-estetica-corporal'
  | 'cejas-y-pestanas'
  // ── Alquiler ──────────────────────────────────────────────
  | 'alquiler-de-herramientas'
  | 'alquiler-de-maquinaria-liviana'
  | 'alquiler-de-maquinaria-pesada'
  | 'alquiler-de-generadores'
  | 'alquiler-de-andamios'
  | 'alquiler-de-hidrolavadoras'
  | 'alquiler-de-hormigoneras'
  | 'alquiler-de-elevadores'
  | 'alquiler-de-equipos-de-sonido-e-iluminacion'
  | 'alquiler-de-carpas-y-mobiliario';

/** Tabs principales del cliente */
export type ClientTabsParamList = {
  Home: undefined;
  Agenda: undefined;
  Chat: undefined;
  Perfil: undefined;
};

/** Tabs del especialista: mismas rutas que cliente */
export type SpecialistTabsParamList = ClientTabsParamList;

/** Stack interno de la pestaña Home del cliente */
export type HomeStackParamList = {
  ClientHome: undefined;
  Category: { id: RootCategoryId };
  SpecialistsList: { categorySlug: CategorySlug; title: string };
  SpecialistProfile: { id: string; lat?: number; lng?: number };

  CreateOrder: {
    specialistId: string;
    specialistName?: string;
    visitPrice?: number | null;
    address?: string;
    serviceId?: string;
  };

  Orders: { role?: 'customer' | 'specialist' } | undefined;

  OrderDetail: {
    id: string;
    role?: 'customer' | 'specialist';
    from?: 'notifications' | 'agenda' | 'home';
  };

  SpecialistWizard: undefined;
  Notifications: undefined;
};

/** Stack interno de la pestaña Chat */
export type ChatStackParamList = {
  ChatList: undefined;
  ChatThread: { threadId?: string; orderId?: string; title?: string };
};

/** Stack interno del Home del especialista */
export type SpecialistHomeStackParamList = {
  SpecialistHome: undefined;
  Notifications: undefined;
  BackgroundCheck: undefined;
};

/** Stack interno del tab Perfil del especialista */
export type SpecialistProfileStackParamList = {
  ProfileMain: undefined;
  BackgroundCheck: undefined;
};

/** ✅ NUEVO: Secciones válidas de Agenda */
export type AgendaSection = 'PENDING' | 'CONFIRMED' | 'FINISHED' | 'CANCELLED';

/**
 * ✅ NUEVO: Stack interno de la pestaña Agenda (compartido)
 * AgendaMain = tu AgendaScreen
 * OrderDetail = detalle dentro de Agenda
 */
export type AgendaStackParamList = {
  AgendaMain: { initialSection?: AgendaSection; refresh?: boolean } | undefined;

  OrderDetail: {
    id: string;
    role?: 'customer' | 'specialist';
    from?: 'notifications' | 'agenda';
  };
};
