// apps/mobile/src/hooks/useOrders.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { acceptOrder, getMyOrders, rescheduleOrder } from '../api/orders';

import type { OrderListItem, OrdersTab, Role } from '../types/orders';

type OrdersListParams = {
  role: Role; // 'customer' | 'specialist'
  status: 'open' | 'closed'; // filtro principal
};

/**
 * Estados que mostramos por cada tab cuando status === 'open'
 * Flujo nuevo:
 * pending -> confirmed -> review -> finished -> cancelled
 */
const OPEN_BY_TAB: Record<OrdersTab, OrderListItem['status'][]> = {
  // Pendientes = todavía no aceptadas por especialista
  pending: ['PENDING'],

  // Confirmados/En curso = aceptadas por especialista (trabajo activo)
  confirmed: ['ASSIGNED', 'IN_PROGRESS', 'PAUSED'],

  // Revisión = el especialista marcó finalizado y el cliente debe confirmar / calificar
  review: ['FINISHED_BY_SPECIALIST', 'IN_CLIENT_REVIEW', 'REJECTED_BY_CLIENT'],

  // Finalizados = confirmados por el cliente y/o cerrados
  finished: ['CONFIRMED_BY_CLIENT', 'CLOSED'],

  // Cancelados
  cancelled: ['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SPECIALIST', 'CANCELLED_AUTO'],
};

export function useOrdersList(params: OrdersListParams, tab: OrdersTab) {
  const key = ['orders', params.role, params.status, tab] as const;

  return useQuery<OrderListItem[]>({
    queryKey: key,
    queryFn: async () => {
      const all = await getMyOrders({ role: params.role, status: params.status });

      // Si la API ya te devuelve "open" filtrado, esto igual es un blindaje para el tab
      if (params.status === 'open') {
        const allow = new Set(OPEN_BY_TAB[tab] ?? []);
        return all.filter((o) => allow.has(o.status));
      }

      // 'closed' -> devolvemos todo lo que venga cerrado
      return all;
    },
    staleTime: 20_000,
  });
}

// --- Acciones ---
export function useAcceptOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { orderId: string; specialistId: string }) =>
      acceptOrder(vars.orderId, { specialistId: vars.specialistId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
}

export function useRescheduleOrder(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { scheduledAt: string; reason?: string }) =>
      rescheduleOrder(orderId, { scheduledAt: vars.scheduledAt, reason: vars.reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
}
