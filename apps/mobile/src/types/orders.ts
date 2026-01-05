export type OrdersTab = 'pending' | 'confirmed' | 'finished' | 'cancelled';

export type Role = 'customer' | 'specialist';

export type OrderListItem = {
  id: string;
  status:
    | 'PENDING'
    | 'ASSIGNED'
    | 'IN_PROGRESS'
    | 'PAUSED'
    | 'FINISHED_BY_SPECIALIST'
    | 'IN_CLIENT_REVIEW'
    | 'CONFIRMED_BY_CLIENT'
    | 'REJECTED_BY_CLIENT'
    | 'CANCELLED_BY_CUSTOMER'
    | 'CANCELLED_BY_SPECIALIST'
    | 'CANCELLED_AUTO'
    | 'CLOSED';
  createdAt: string;
  scheduledAt: string | null;
  preferredAt: string | null;
  price: number | null;
  service: { id: string; name: string };
  specialist: { id: string; name: string } | null;
  customer: { id: string; name: string } | null;
  address: string | null;
};

export type OrderDetail = {
  id: string;
  status: OrderListItem['status'];
  createdAt: string;
  scheduledAt: string | null;
  preferredAt: string | null;
  isUrgent: boolean;
  price: number | null;
  description: string | null;
  attachments: unknown[] | null;
  service: { id: string; name: string };
  specialist: { id: string; name: string } | null;
  customer: { id: string; name: string } | null;
  address: { id: string; formatted: string } | null;
  events: { id: string; type: string; payload: any; createdAt: string }[];
  chatThreadId: string | null;
  rating: { score: number; comment: string | null } | null;
};
