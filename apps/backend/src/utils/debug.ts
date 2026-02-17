// apps/backend/src/utils/debug.ts

export const isProd = process.env.NODE_ENV === 'production';

// Debug flags (usar '1' para activo)
export const debugOrders = process.env.DEBUG_ORDERS === '1';
export const debugOrderDetail = process.env.DEBUG_ORDER_DETAIL === '1';
export const debugSpecialists = process.env.DEBUG_SPECIALISTS === '1';
export const debugPayments = process.env.DEBUG_PAYMENTS === '1';
export const debugPush = process.env.DEBUG_PUSH === '1';
export const debugUploads = process.env.DEBUG_UPLOADS === '1';
export const debugNotifications = process.env.DEBUG_NOTIFICATIONS === '1';

/**
 * Helper centralizado para logs controlados.
 * Solo imprime si el flag correspondiente está activo.
 */
export const dbg = (enabled: boolean, ...args: any[]) => {
  if (!enabled) return;
  console.log(...args);
};

/**
 * Helper para obtener mensaje de error seguro
 * (evita volcar objetos gigantes en consola)
 */
export const errMsg = (e: unknown) =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);
