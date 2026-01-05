// apps/mobile/src/types/chat.ts

export type ChatThread = {
  id: string;
  orderId: string;
  createdAt: string;
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
};

// 👇 Debe coincidir con lo que armás en chat.routes.ts (items = rows.map(...))
export type ChatThreadListItem = {
  id: string;
  orderId: string | null;
  serviceName: string;
  address: string | null;
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
  };
};
