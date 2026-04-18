//apps/mobile/src/lib/clientsApi.ts
import { api } from './api';

export type ClientProfileHistoryItem = {
  orderId: string;
  status: string;
  createdAt: string;
  scheduledAt: string | null;
  preferredAt: string | null;
  serviceMode: 'HOME' | 'OFFICE' | 'ONLINE';
  serviceName: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  specialist: {
    id: string;
    name: string;
  } | null;
};

export type ClientProfile = {
  userId: string;
  customerProfileId: string;
  name: string;
  surname: string;
  avatarUrl: string | null;
  memberSince: string;
  stats: {
    totalOrders: number;
    completedOrders: number;
    closedOrders: number;
    canceledByCustomerOrders: number;
    canceledBySpecialistOrders: number;
  };
  history: ClientProfileHistoryItem[];
};

type GetClientProfileResponse = {
  ok: boolean;
  profile: ClientProfile;
};

export async function getClientProfile(userId: string) {
  const { data } = await api.get<GetClientProfileResponse>(`/clients/${userId}/profile`);
  return data.profile;
}
