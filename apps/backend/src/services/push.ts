// apps/backend/src/services/push.ts
// LEGACY: mantener compatibilidad con imports viejos.
// TODO: migrar imports a ./pushExpo y luego eliminar este archivo.

export { sendExpoPush } from './pushExpo';
export type { ExpoMessage as PushMessage } from './pushExpo';
