//pps/mobile/src/screens/ClientProfileScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getClientProfile, type ClientProfile } from '../lib/clientsApi';
import { resolveUploadUrl } from '../lib/resolveUploadUrl';

function formatDate(date?: string | null) {
  if (!date) return '—';
  try {
    return new Date(date).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function getDisplayName(profile?: ClientProfile | null) {
  if (!profile) return 'Cliente';
  const full = `${profile.name ?? ''} ${profile.surname ?? ''}`.trim();
  return full || 'Cliente';
}

function getInitials(profile?: ClientProfile | null) {
  const name = profile?.name?.trim()?.[0] ?? '';
  const surname = profile?.surname?.trim()?.[0] ?? '';
  const initials = `${name}${surname}`.trim().toUpperCase();
  return initials || 'C';
}

function getStatusLabel(status?: string | null) {
  const s = String(status ?? '')
    .trim()
    .toUpperCase();

  if (s === 'PENDING') return 'Pendiente';
  if (s === 'ASSIGNED') return 'Asignado';
  if (s === 'IN_PROGRESS') return 'En curso';
  if (s === 'PAUSED') return 'Pausado';
  if (s === 'FINISHED_BY_SPECIALIST') return 'Finalizado por especialista';
  if (s === 'IN_CLIENT_REVIEW') return 'En revisión';
  if (s === 'CONFIRMED_BY_CLIENT') return 'Confirmado por cliente';
  if (s === 'CLOSED') return 'Cerrado';
  if (s === 'CANCELLED_BY_CUSTOMER') return 'Cancelado por cliente';
  if (s === 'CANCELLED_BY_SPECIALIST') return 'Cancelado por especialista';
  if (s === 'CANCELLED_AUTO') return 'Cancelado automático';

  return status ?? '—';
}

export default function ClientProfileScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const route = useRoute<any>();

  const userId: string | null = route.params?.userId ?? null;
  const fallbackName: string | null = route.params?.name ?? null;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ClientProfile | null>(null);

  const goBack = useCallback(() => {
    if (nav.canGoBack?.()) {
      nav.goBack();
      return true;
    }

    const parent = nav.getParent?.();
    if (parent?.goBack) {
      parent.goBack();
      return true;
    }

    return false;
  }, [nav]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const sub = BackHandler.addEventListener('hardwareBackPress', () => goBack());
    return () => sub.remove();
  }, [goBack]);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!userId) {
        setError('No se recibió el usuario del cliente.');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        setError(null);

        const data = await getClientProfile(userId);
        setProfile(data);
      } catch (e: any) {
        const msg =
          e?.response?.data?.error || e?.message || 'No se pudo cargar el perfil del cliente.';
        setError(msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const displayName = useMemo(() => {
    if (profile) return getDisplayName(profile);
    return fallbackName?.trim() || 'Cliente';
  }, [profile, fallbackName]);

  const avatarUrl = useMemo(() => {
    if (!profile?.avatarUrl) return null;
    return resolveUploadUrl(profile.avatarUrl);
  }, [profile?.avatarUrl]);

  return (
    <LinearGradient colors={['#0B6B76', '#0E8A97', '#F4FBFC']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <View
          style={{
            paddingTop: 6,
            paddingHorizontal: 16,
            paddingBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Pressable
            onPress={goBack}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.16)',
            }}
          >
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: 12 }}>
              Perfil del cliente
            </Text>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{displayName}</Text>
          </View>
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color="#ffffff" />
            <Text style={{ marginTop: 12, color: '#fff', fontWeight: '600' }}>
              Cargando perfil...
            </Text>
          </View>
        ) : error ? (
          <View style={{ flex: 1, paddingHorizontal: 20, justifyContent: 'center' }}>
            <View
              style={{
                backgroundColor: 'rgba(255,255,255,0.96)',
                borderRadius: 22,
                padding: 18,
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#16333A' }}>
                No pudimos cargar el perfil
              </Text>
              <Text style={{ marginTop: 8, color: '#4D6870', lineHeight: 21 }}>{error}</Text>

              <Pressable
                onPress={() => load(false)}
                style={{
                  marginTop: 16,
                  alignSelf: 'flex-start',
                  backgroundColor: '#0B6B76',
                  borderRadius: 14,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Reintentar</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: Math.max(28, insets.bottom + 18),
            }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          >
            <View
              style={{
                backgroundColor: 'rgba(255,255,255,0.96)',
                borderRadius: 28,
                padding: 18,
                marginTop: 6,
              }}
            >
              <View style={{ alignItems: 'center' }}>
                {avatarUrl ? (
                  <View
                    style={{
                      width: 82,
                      height: 82,
                      borderRadius: 41,
                      overflow: 'hidden',
                      backgroundColor: '#DCEFF1',
                      marginBottom: 12,
                    }}
                  >
                    {/* Mantengo vista simple para no tocar ExpoImage ahora */}
                    <View
                      style={{
                        flex: 1,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#DCEFF1',
                      }}
                    >
                      <Text style={{ fontSize: 26, fontWeight: '800', color: '#0B6B76' }}>
                        {getInitials(profile)}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View
                    style={{
                      width: 82,
                      height: 82,
                      borderRadius: 41,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: '#DCEFF1',
                      marginBottom: 12,
                    }}
                  >
                    <Text style={{ fontSize: 26, fontWeight: '800', color: '#0B6B76' }}>
                      {getInitials(profile)}
                    </Text>
                  </View>
                )}

                <Text style={{ fontSize: 22, fontWeight: '800', color: '#16333A' }}>
                  {displayName}
                </Text>

                <Text style={{ marginTop: 6, color: '#5D747B', fontSize: 14 }}>
                  Miembro desde {formatDate(profile?.memberSince)}
                </Text>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  gap: 10,
                  marginTop: 18,
                }}
              >
                <View
                  style={{
                    flex: 1,
                    backgroundColor: '#F3FAFB',
                    borderRadius: 18,
                    padding: 14,
                  }}
                >
                  <Text style={{ color: '#61818A', fontSize: 12 }}>Trabajos totales</Text>
                  <Text style={{ marginTop: 4, color: '#16333A', fontSize: 22, fontWeight: '800' }}>
                    {profile?.stats?.totalOrders ?? 0}
                  </Text>
                </View>

                <View
                  style={{
                    flex: 1,
                    backgroundColor: '#F3FAFB',
                    borderRadius: 18,
                    padding: 14,
                  }}
                >
                  <Text style={{ color: '#61818A', fontSize: 12 }}>Completados</Text>
                  <Text style={{ marginTop: 4, color: '#16333A', fontSize: 22, fontWeight: '800' }}>
                    {profile?.stats?.completedOrders ?? 0}
                  </Text>
                </View>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  gap: 10,
                  marginTop: 10,
                }}
              >
                <View
                  style={{
                    flex: 1,
                    backgroundColor: '#FFF7F4',
                    borderRadius: 18,
                    padding: 14,
                  }}
                >
                  <Text style={{ color: '#8A6B61', fontSize: 12 }}>Cancelados por cliente</Text>
                  <Text style={{ marginTop: 4, color: '#16333A', fontSize: 20, fontWeight: '800' }}>
                    {profile?.stats?.canceledByCustomerOrders ?? 0}
                  </Text>
                </View>

                <View
                  style={{
                    flex: 1,
                    backgroundColor: '#FFF7F4',
                    borderRadius: 18,
                    padding: 14,
                  }}
                >
                  <Text style={{ color: '#8A6B61', fontSize: 12 }}>
                    Cancelados por especialista
                  </Text>
                  <Text style={{ marginTop: 4, color: '#16333A', fontSize: 20, fontWeight: '800' }}>
                    {profile?.stats?.canceledBySpecialistOrders ?? 0}
                  </Text>
                </View>
              </View>
            </View>

            <View
              style={{
                backgroundColor: 'rgba(255,255,255,0.97)',
                borderRadius: 28,
                padding: 18,
                marginTop: 14,
                marginBottom: 12,
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#16333A' }}>
                Historial reciente
              </Text>

              {!profile?.history?.length ? (
                <Text style={{ marginTop: 12, color: '#62757B', lineHeight: 21 }}>
                  Este cliente todavía no tiene historial visible en la app.
                </Text>
              ) : (
                <View style={{ marginTop: 12, gap: 12 }}>
                  {profile.history.map((item) => (
                    <View
                      key={item.orderId}
                      style={{
                        borderRadius: 18,
                        padding: 14,
                        backgroundColor: '#F7FBFC',
                        borderWidth: 1,
                        borderColor: '#E2EEF0',
                      }}
                    >
                      <Text style={{ color: '#16333A', fontSize: 15, fontWeight: '800' }}>
                        {item.serviceName || 'Servicio'}
                      </Text>

                      <Text style={{ marginTop: 4, color: '#476067' }}>
                        {item.categoryName || 'Sin categoría'}
                      </Text>

                      <Text style={{ marginTop: 6, color: '#5C7178', fontSize: 13 }}>
                        Estado: {getStatusLabel(item.status)}
                      </Text>

                      <Text style={{ marginTop: 4, color: '#5C7178', fontSize: 13 }}>
                        Fecha: {formatDate(item.createdAt)}
                      </Text>

                      <Text style={{ marginTop: 4, color: '#5C7178', fontSize: 13 }}>
                        Modalidad: {item.serviceMode}
                      </Text>

                      <Text style={{ marginTop: 4, color: '#5C7178', fontSize: 13 }}>
                        Especialista: {item.specialist?.name || 'Sin especialista'}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}
