// apps/mobile/src/api/orders.ts
import { api } from '../lib/api';

import type { OrderDetail, OrderListItem, Role } from '../types/orders';

export async function getMyOrders(params: { role: Role; status: 'open' | 'closed' }) {
  const r = await api.get<{ ok: boolean; orders: OrderListItem[] }>('/orders/mine', { params });
  return r.data.orders;
}

export async function getOrder(id: string) {
  const r = await api.get<{ ok: boolean; order: OrderDetail }>(`/orders/${id}`);
  return r.data.order;
}

export async function acceptOrder(orderId: string, args: { specialistId: string }) {
  const r = await api.post<{ ok: boolean }>(`/orders/${orderId}/accept`, args);
  return r.data;
}

export async function rescheduleOrder(
  orderId: string,
  args: { scheduledAt: string; reason?: string },
) {
  const r = await api.post<{ ok: boolean }>(`/orders/${orderId}/reschedule`, args);
  return r.data;
}

export async function finishOrder(orderId: string, args: { attachments?: any[]; note?: string }) {
  const r = await api.post<{ ok: boolean }>(`/orders/${orderId}/finish`, args);
  return r.data;
}

export async function confirmOrder(orderId: string) {
  const r = await api.post<{ ok: boolean }>(`/orders/${orderId}/confirm`);
  return r.data;
}

export async function rateOrder(orderId: string, args: { score: number; comment?: string }) {
  const r = await api.post<{ ok: boolean }>(`/orders/${orderId}/rate`, args);
  return r.data;
}

export async function cancelOrder(orderId: string, args: { reason: string }) {
  const r = await api.post<{ ok: boolean }>(`/orders/${orderId}/cancel`, args);
  return r.data;
}

export async function cancelBySpecialist(orderId: string, args: { reason: string }) {
  const r = await api.post<{ ok: boolean }>(`/orders/${orderId}/cancel-by-specialist`, args);
  return r.data;
}
