// apps/backend/src/services/chatCleanup.ts
import { prisma } from '../lib/prisma'

/**
 * Elimina el chat asociado a una orden:
 * - Borra ChatThread
 * - Por cascada, se borran todos los ChatMessage de ese thread
 *
 * Es seguro llamarla aunque no exista thread (deleteMany = 0 filas).
 */
export async function deleteChatForOrder(orderId: string) {
  try {
    await prisma.chatThread.deleteMany({
      where: { orderId },
    })
  } catch (e) {
    console.warn('[deleteChatForOrder] error', { orderId, e })
  }
}
