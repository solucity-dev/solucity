// apps/mobile/src/screens/SubscriptionScreen.tsx
import { Ionicons, MaterialCommunityIcons as MDI } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

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

  trialDaysRemaining: number;
  subscriptionDaysRemaining: number;
  isTrialActive: boolean;
  isSubscriptionActive: boolean;
  canPay: boolean;
  accessUntil: string | null;
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function statusPill(status: SubscriptionDTO['status']) {
  switch (status) {
    case 'ACTIVE':
      return { label: 'Suscripción activa', bg: 'rgba(0,160,120,0.20)', txt: '#8EF0CF' };
    case 'TRIALING':
      return { label: 'Período de prueba', bg: 'rgba(240,200,60,0.18)', txt: '#FFE8A3' };
    case 'PAST_DUE':
      return { label: 'Pago pendiente', bg: 'rgba(240,50,60,0.18)', txt: '#FFC7CD' };
    case 'CANCELLED':
    default:
      return { label: 'Suscripción inactiva', bg: 'rgba(255,255,255,0.10)', txt: '#E9FEFF' };
  }
}

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const mountedRef = useRef(true);

  const [loading, setLoading] = useState(true);
  const [payLoading, setPayLoading] = useState(false);
  const [sub, setSub] = useState<SubscriptionDTO | null>(null);

  // ✅ “Activar ahora” habilitado salvo que ya esté ACTIVE.
  // Si estás en TRIALING y el backend no permite pagar, devolverá trial_active (lo manejamos).
  const canPay = useMemo(() => {
    if (!sub) return false;
    return sub.canPay;
  }, [sub]);

  const fetchMe = useCallback(async () => {
    if (mountedRef.current) setLoading(true);

    try {
      clearSubscriptionCache();
      const s = await getMySubscription({ force: true });

      if (!mountedRef.current) return;
      setSub((s as SubscriptionDTO) ?? null);
    } catch (err: any) {
      if (!mountedRef.current) return;

      const msg = String(err?.response?.data?.error || err?.message || 'error');
      Alert.alert('Suscripción', `No se pudo cargar: ${msg}`);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchMe();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchMe]);

  // 🔁 cuando volvés desde Mercado Pago
  useEffect(() => {
    const listener = Linking.addEventListener('url', () => {
      fetchMe();
    });
    return () => listener.remove();
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
        Alert.alert(
          'Prueba gratis activa',
          'Todavía tenés días gratis disponibles. No necesitás pagar por ahora.',
        );
        await fetchMe();
        return;
      }

      if (err === 'subscription_already_active') {
        Alert.alert(
          'Suscripción activa',
          'Tu suscripción ya está activa. No hace falta volver a pagar en este momento.',
        );
        await fetchMe();
        return;
      }

      Alert.alert('Pago', 'No se pudo iniciar el pago.');
    } finally {
      if (mountedRef.current) setPayLoading(false);
    }
  }, [canPay, fetchMe]);

  const pill = sub ? statusPill(sub.status) : null;

  const headerSubtitle = useMemo(() => {
    if (!sub) return '';

    if (sub.isTrialActive) {
      const d = sub.trialDaysRemaining ?? 0;
      return `Tenés ${d} día${d === 1 ? '' : 's'} gratis. No es necesario pagar todavía.`;
    }

    if (sub.isSubscriptionActive) {
      const d = sub.subscriptionDaysRemaining ?? 0;
      return `Tu suscripción está activa. Te quedan ${d} día${d === 1 ? '' : 's'} de acceso.`;
    }

    if (sub.status === 'PAST_DUE') {
      return 'Tenés un pago pendiente. Activá para seguir visible.';
    }

    return 'Tu suscripción está inactiva. Activá para aparecer en búsquedas.';
  }, [sub]);

  if (loading) {
    return (
      <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
        <SafeAreaView style={styles.center} edges={['top', 'bottom']}>
          <ActivityIndicator color="#E9FEFF" />
          <Text style={{ color: '#E9FEFF', marginTop: 10, fontWeight: '800' }}>
            Cargando suscripción…
          </Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, paddingTop: 6 }} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Suscripción</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 32 + insets.bottom + 70,
            gap: 14,
          }}
          showsVerticalScrollIndicator={false}
        >
          {!sub ? (
            <View style={styles.card}>
              <Text style={{ color: '#E9FEFF', fontWeight: '800' }}>
                No se encontró información de suscripción.
              </Text>

              <Pressable onPress={fetchMe} style={[styles.btnOutline, { marginTop: 12 }]}>
                <Text style={styles.btnOutlineText}>Reintentar</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Estado */}
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <View style={[styles.pill, { backgroundColor: pill?.bg }]}>
                    <Text style={[styles.pillText, { color: pill?.txt }]}>{pill?.label}</Text>
                  </View>

                  <Ionicons
                    name={sub.status === 'ACTIVE' ? 'checkmark-circle' : 'time-outline'}
                    size={20}
                    color="#E9FEFF"
                  />
                </View>

                <Text style={styles.mainInfo}>{headerSubtitle}</Text>

                <View style={{ marginTop: 10, gap: 6 }}>
                  <InfoRow
                    icon={<Ionicons name="calendar-outline" size={18} color="#E9FEFF" />}
                    label={`Inicio del período: ${formatDate(sub.currentPeriodStart)}`}
                  />

                  {sub.isTrialActive ? (
                    <>
                      <InfoRow
                        icon={<Ionicons name="gift-outline" size={18} color="#E9FEFF" />}
                        label={`Prueba gratis hasta: ${formatDate(sub.trialEnd)}`}
                      />

                      <View style={styles.noticeBox}>
                        <MDI name="information-outline" size={18} color="#E9FEFF" />
                        <Text style={styles.noticeText}>
                          Te quedan{' '}
                          <Text style={{ fontWeight: '900' }}>
                            {sub.trialDaysRemaining} día{sub.trialDaysRemaining === 1 ? '' : 's'}
                          </Text>{' '}
                          gratis. El pago se habilitará cuando termine ese período.
                        </Text>
                      </View>
                    </>
                  ) : sub.isSubscriptionActive ? (
                    <>
                      <InfoRow
                        icon={<Ionicons name="calendar" size={18} color="#E9FEFF" />}
                        label={`Suscripción activa hasta: ${formatDate(sub.currentPeriodEnd)}`}
                      />

                      <View style={styles.noticeBox}>
                        <MDI name="check-circle-outline" size={18} color="#E9FEFF" />
                        <Text style={styles.noticeText}>
                          Tenés tu suscripción activa con{' '}
                          <Text style={{ fontWeight: '900' }}>
                            {sub.subscriptionDaysRemaining} día
                            {sub.subscriptionDaysRemaining === 1 ? '' : 's'}
                          </Text>{' '}
                          restantes.
                        </Text>
                      </View>
                    </>
                  ) : (
                    <InfoRow
                      icon={<Ionicons name="calendar" size={18} color="#E9FEFF" />}
                      label={`Fin del período: ${formatDate(sub.currentPeriodEnd)}`}
                    />
                  )}
                </View>

                <Pressable onPress={fetchMe} style={[styles.btnOutline, { marginTop: 12 }]}>
                  <Ionicons name="refresh" size={18} color="#E9FEFF" />
                  <Text style={styles.btnOutlineText}>Actualizar estado</Text>
                </Pressable>
              </View>

              {/* Plan */}
              <View style={[styles.card, styles.planCard]}>
                <View style={styles.planHeader}>
                  <View>
                    <Text style={styles.planTitle}>Plan mensual</Text>
                    <Text style={styles.planPrice}>$15.000 ARS / mes</Text>
                  </View>
                  <View style={styles.planBadge}>
                    <Text style={styles.planBadgeText}>Pro</Text>
                  </View>
                </View>

                <View style={{ marginTop: 12, gap: 10 }}>
                  <Benefit
                    icon={<Ionicons name="search-outline" size={18} color="#E9FEFF" />}
                    text="Aparecés en búsquedas de clientes"
                  />
                  <Benefit
                    icon={<Ionicons name="chatbubbles-outline" size={18} color="#E9FEFF" />}
                    text="Podés contactar clientes sin límites"
                  />
                  <Benefit
                    icon={<Ionicons name="navigate-outline" size={18} color="#E9FEFF" />}
                    text="Visibilidad hasta 30 km (según tu radio)"
                  />
                  <Benefit
                    icon={<Ionicons name="infinite-outline" size={18} color="#E9FEFF" />}
                    text="Recibí nuevos trabajos desde la app"
                  />
                  <Benefit
                    icon={<MDI name="percent-outline" size={18} color="#E9FEFF" />}
                    text="Sin comisiones por trabajo (0%)"
                  />
                </View>

                <Pressable
                  onPress={onPay}
                  disabled={!canPay || payLoading}
                  style={[
                    styles.btnPrimary,
                    (!canPay || payLoading) && { opacity: 0.6 },
                    { marginTop: 14 },
                  ]}
                >
                  {payLoading ? (
                    <ActivityIndicator color="#015A69" />
                  ) : (
                    <>
                      <Ionicons name="flash-outline" size={18} color="#015A69" />
                      <Text style={styles.btnPrimaryText}>
                        {sub.isSubscriptionActive
                          ? 'Plan activo ✅'
                          : sub.isTrialActive
                            ? 'Prueba gratis en curso'
                            : 'Activar ahora'}
                      </Text>
                    </>
                  )}
                </Pressable>

                {sub.isSubscriptionActive ? (
                  <Text style={styles.hint}>
                    Tu plan ya está activo. Desde acá podés revisar hasta cuándo tenés acceso.
                  </Text>
                ) : sub.isTrialActive ? (
                  <Text style={styles.hint}>
                    Tenés una prueba gratis activa. El botón de pago queda bloqueado hasta que ese
                    período termine.
                  </Text>
                ) : (
                  <Text style={styles.hint}>
                    Si tu prueba terminó o tenés un pago pendiente, activá para seguir visible.
                  </Text>
                )}
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function InfoRow(props: { icon: React.ReactNode; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {props.icon}
      <Text style={{ color: 'rgba(233,254,255,0.9)', flex: 1 }}>{props.label}</Text>
    </View>
  );
}

function Benefit(props: { icon: React.ReactNode; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={styles.benefitIcon}>{props.icon}</View>
      <Text style={styles.benefitText}>{props.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerTitle: {
    color: '#E9FEFF',
    fontSize: 22,
    fontWeight: '800',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },

  card: {
    backgroundColor: 'rgba(0, 35, 40, 0.32)',
    borderRadius: 18,
    padding: 16,
  },

  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillText: {
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.3,
  },

  mainInfo: {
    color: '#E9FEFF',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
    lineHeight: 20,
  },

  noticeBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(233,254,255,0.18)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  noticeText: {
    color: '#E9FEFF',
    flex: 1,
    lineHeight: 18,
  },

  btnOutline: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(233,254,255,0.45)',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flexDirection: 'row',
  },
  btnOutlineText: { color: '#E9FEFF', fontWeight: '900' },

  planCard: {
    backgroundColor: 'rgba(3, 55, 63, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(233,254,255,0.18)',
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  planTitle: { color: '#E9FEFF', fontWeight: '900', fontSize: 16 },
  planPrice: { color: '#E9FEFF', marginTop: 4, fontWeight: '800', fontSize: 14 },

  planBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(233,254,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(233,254,255,0.18)',
  },
  planBadgeText: { color: '#E9FEFF', fontWeight: '900', fontSize: 12, letterSpacing: 0.4 },

  benefitIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(233,254,255,0.18)',
  },
  benefitText: {
    color: 'rgba(233,254,255,0.92)',
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
  },

  btnPrimary: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#E9FEFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  btnPrimaryText: { color: '#015A69', fontWeight: '900' },

  hint: {
    marginTop: 10,
    color: '#B5DADD',
    fontSize: 12,
    lineHeight: 16,
  },
});
