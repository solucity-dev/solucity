//apps/mobile/src/lib/analytics.ts
import { Platform } from 'react-native';

import { api } from './api';

export type AnalyticsEventType =
  | 'app_open'
  | 'view_home'
  | 'view_category'
  | 'view_specialists_list'
  | 'view_specialist_profile'
  | 'tap_hire_from_card'
  | 'tap_hire_from_profile'
  | 'inquiry_created'
  | 'order_created';

export type TrackEventInput = {
  eventType: AnalyticsEventType;
  sessionId?: string | null;
  screen?: string | null;
  categorySlug?: string | null;
  specialistId?: string | null;
  orderId?: string | null;
  metadata?: Record<string, unknown> | null;
};

let inMemorySessionId: string | null = null;

function createSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getAnalyticsSessionId() {
  if (!inMemorySessionId) {
    inMemorySessionId = createSessionId();
  }
  return inMemorySessionId;
}

export async function trackEvent(input: TrackEventInput) {
  try {
    await api.post('/analytics/events', {
      eventType: input.eventType,
      sessionId: input.sessionId ?? getAnalyticsSessionId(),
      screen: input.screen ?? null,
      platform: Platform.OS,
      categorySlug: input.categorySlug ?? null,
      specialistId: input.specialistId ?? null,
      orderId: input.orderId ?? null,
      metadata: input.metadata ?? null,
    });
  } catch (error) {
    console.warn('[analytics] trackEvent failed', error);
  }
}
