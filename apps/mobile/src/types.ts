// src/types.ts

/** Grupos raíz para la grilla principal */
export type RootCategoryId =
  | 'construccion-mantenimiento'
  | 'informatica-electronica'
  | 'seguridad'
  | 'servicios';

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
  | 'plomeria'
  | 'pintura'
  | 'jardineria'
  | 'piscinas'
  // ── Informática & Electrónica ─────────────────────────────
  | 'climatizacion'
  | 'servicio-tecnico-electronica'
  | 'servicio-tecnico-electrodomesticos'
  | 'servicio-tecnico-informatica'
  // ── Seguridad ─────────────────────────────────────────────
  | 'cerrajeria'
  | 'camaras-y-alarmas'
  | 'personal-de-seguridad'
  // ── Servicios Generales ───────────────────────────────────
  | 'limpieza'
  | 'clases-particulares'
  | 'paseador-de-perros'
  | 'acompanante-terapeutico'
  | 'fletes';

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
  Category: { id: CategorySlug };
  SpecialistsList: { categorySlug: CategorySlug; title: string };
  SpecialistProfile: { id: string; title?: string };

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
