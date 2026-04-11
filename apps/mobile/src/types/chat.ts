// apps/mobile/src/types/chat.ts

export type ChatThreadType = 'ORDER' | 'INQUIRY';

export type ChatThread = {
  id: string;
  orderId: string | null;
  createdAt: string;
  type?: ChatThreadType;
  specialistId?: string | null;
  businessName?: string | null;
};

export type ChatMessage = {
  id: string;
  body: string;
  senderId: string;
  createdAt: string;
  readAt: string | null;
  // 🔥 campos nuevos que ahora manda el backend:
  isMine?: boolean;
  senderName?: string;
};

/** 👤 Persona con la que chateo en cada hilo */
export type ChatThreadCounterpart = {
  kind: 'customer' | 'specialist';
  name: string;
  avatarUrl?: string | null;
  businessName?: string | null; // ✅ NUEVO
};

// 👇 Debe coincidir con lo que armás en chat.routes.ts (items = rows.map(...))
export type ChatThreadListItem = {
  id: string;
  type: ChatThreadType;
  orderId: string | null;
  serviceName: string;
  address: string | null;
  categorySlug?: string | null;
  counterpart: ChatThreadCounterpart;
  lastMessage: {
    id: string;
    text: string;
    createdAt: string;
    senderName: string;
  } | null;
  createdAt: string;
};
// Alias por compatibilidad
export type ChatThreadSummary = ChatThreadListItem;

export type ChatStackParamList = {
  ChatList: undefined;
  ChatThread: {
    orderId?: string;
    threadId?: string;
    title?: string;
    businessName?: string | null;
    threadType?: ChatThreadType;
    specialistId?: string;
    categorySlug?: string | null;
  };
};
