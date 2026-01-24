// apps/mobile/src/screens/SubscriptionScreen.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from 'react-native';

import {
  clearSubscriptionCache,
  createSubscriptionPaymentLink,
  getMySubscription,
} from '../lib/subscriptionApi';

type SubscriptionDTO = {
  id: string;
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEnd: string | null;
  daysRemaining: number | null;
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function SubscriptionScreen() {
  const [loading, setLoading] = useState(true);
  const [payLoading, setPayLoading] = useState(false);
  const [sub, setSub] = useState<SubscriptionDTO | null>(null);

  const canPay = useMemo(() => {
    if (!sub) return false;
    if (sub.status === 'ACTIVE') return false;
    if (sub.status === 'TRIALING' && (sub.daysRemaining ?? 0) > 0) return false;
    return true; // PAST_DUE o trial vencido
  }, [sub]);

  const fetchMe = useCallback(async () => {
    setLoading(true);
    try {
      clearSubscriptionCache();
      const s = await getMySubscription({ force: true });
      setSub((s as SubscriptionDTO) ?? null);
    } catch (err: any) {
      const msg = String(err?.response?.data?.error || err?.message || 'error');

      Alert.alert('Suscripción', `No se pudo cargar: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  // 🔁 cuando volvés desde Mercado Pago
  useEffect(() => {
    const sub = Linking.addEventListener('url', () => {
      fetchMe();
    });
    return () => sub.remove();
  }, [fetchMe]);

  const onPay = useCallback(async () => {
    if (!canPay) return;

    setPayLoading(true);
    try {
      const r = await createSubscriptionPaymentLink();
      const initPoint = r.initPoint;

      if (!initPoint) {
        Alert.alert('Pago', 'No se recibió link de pago.');
        return;
      }

      const ok = await Linking.canOpenURL(initPoint);
      if (!ok) {
        Alert.alert('Pago', 'No se pudo abrir Mercado Pago.');
        return;
      }

      await Linking.openURL(initPoint);
    } catch (e: any) {
      const err = String(e?.response?.data?.error || e?.message || 'error');

      if (err === 'trial_active') {
        Alert.alert('Suscripción', 'Tu prueba gratis todavía está activa.');
        return;
      }

      Alert.alert('Pago', 'No se pudo iniciar el pago.');
    } finally {
      setPayLoading(false);
    }
  }, [canPay]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
        <Text style={{ marginTop: 12 }}>Cargando suscripción...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '700' }}>Suscripción</Text>

      {!sub ? (
        <View style={{ padding: 14, borderRadius: 12, borderWidth: 1 }}>
          <Text>No se encontró información de suscripción.</Text>
          <Pressable
            onPress={fetchMe}
            style={{ marginTop: 12, padding: 12, borderRadius: 10, borderWidth: 1 }}
          >
            <Text style={{ fontWeight: '600' }}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={{ padding: 14, borderRadius: 12, borderWidth: 1, gap: 6 }}>
            <Text>
              Estado: <Text style={{ fontWeight: '700' }}>{sub.status}</Text>
            </Text>

            <Text>Inicio período: {formatDate(sub.currentPeriodStart)}</Text>
            <Text>Fin período: {formatDate(sub.currentPeriodEnd)}</Text>

            {sub.trialEnd ? <Text>Trial hasta: {formatDate(sub.trialEnd)}</Text> : null}

            {sub.status === 'TRIALING' && (sub.daysRemaining ?? 0) > 0 ? (
              <Text style={{ marginTop: 8, fontWeight: '700' }}>
                Te quedan {sub.daysRemaining} días gratis 🎁
              </Text>
            ) : null}
          </View>

          <View style={{ padding: 14, borderRadius: 12, borderWidth: 1, gap: 10 }}>
            <Text style={{ fontSize: 16, fontWeight: '700' }}>Plan mensual</Text>
            <Text>$15.000 ARS / mes</Text>

            <Pressable
              onPress={onPay}
              disabled={!canPay || payLoading}
              style={{
                padding: 14,
                borderRadius: 12,
                borderWidth: 1,
                opacity: !canPay || payLoading ? 0.5 : 1,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontWeight: '700' }}>
                {payLoading
                  ? 'Generando link...'
                  : canPay
                    ? 'Pagar $15.000'
                    : 'No corresponde pagar'}
              </Text>
            </Pressable>

            <Pressable
              onPress={fetchMe}
              style={{ padding: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' }}
            >
              <Text style={{ fontWeight: '600' }}>Actualizar estado</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}
