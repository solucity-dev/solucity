// apps/mobile/src/screens/ProfileScreen.tsx
import { Ionicons, MaterialCommunityIcons as MDI } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthProvider';
import { api } from '../lib/api';
import { getMySubscription, type SubscriptionInfo } from '../lib/subscriptionApi';

type UserRole = 'ADMIN' | 'CUSTOMER' | 'SPECIALIST';
type KycStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';

type MeResponse = {
  ok: boolean;
  user: {
    id: string;
    email: string;
    name?: string | null;
    surname?: string | null;
    phone?: string | null;
    role?: UserRole;
  };
};

// 👇 misma función que en SpecialistHome
function absoluteUrl(u?: string | null): string | undefined {
  if (!u) return undefined;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('/')) {
    const base = api.defaults.baseURL ?? '';
    return `${base.replace(/\/+$/, '')}${u}`;
  }
  return u;
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

function renderSubscriptionMainText(sub: SubscriptionInfo) {
  if (sub.status === 'TRIALING') {
    if (typeof sub.daysRemaining === 'number') {
      if (sub.daysRemaining <= 0) return 'Tu prueba termina hoy.';
      if (sub.daysRemaining === 1) return 'Te queda 1 día de prueba.';
      return `Te quedan ${sub.daysRemaining} días de prueba.`;
    }
    return 'Tenés una prueba activa.';
  }
  if (sub.status === 'ACTIVE') return 'Tu suscripción está activa.';
  if (sub.status === 'PAST_DUE') return 'Tu suscripción tiene un pago pendiente.';
  return 'Tu suscripción está inactiva.';
}

function kycLabel(status?: KycStatus | null) {
  switch (status) {
    case 'VERIFIED':
      return 'Verificado';
    case 'PENDING':
      return 'En revisión';
    case 'REJECTED':
      return 'Rechazado';
    case 'UNVERIFIED':
    default:
      return 'Pendiente';
  }
}

function kycIcon(status?: KycStatus | null): keyof typeof Ionicons.glyphMap {
  switch (status) {
    case 'VERIFIED':
      return 'checkmark-circle-outline';
    case 'PENDING':
      return 'time-outline';
    case 'REJECTED':
      return 'close-circle-outline';
    default:
      return 'alert-circle-outline';
  }
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const auth = useAuth() as any;
  const signOut = auth?.signOut ?? auth?.logout ?? auth?.signOutAsync;

  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [role, setRole] = useState<UserRole | null>(null);

  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // ✅ KYC status (solo specialist)
  const [kycStatus, setKycStatus] = useState<KycStatus | null>(null);

  type BackgroundCheckStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

  type BackgroundCheckInfo = {
    status: BackgroundCheckStatus;
    reviewedAt?: string | null;
    rejectionReason?: string | null;
    fileUrl?: string | null;
  } | null;

  const [backgroundCheck, setBackgroundCheck] = useState<BackgroundCheckInfo>(null);
  const [bgUploading] = useState(false);

  // suscripción (solo specialist)
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);

  // cambio de contraseña
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // notificaciones (por ahora local)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const isSpecialist = role === 'SPECIALIST';
  const isCustomer = role === 'CUSTOMER';

  // ✅ Carga rápida: /auth/me bloqueante, extras background
  const loadProfile = useCallback(async () => {
    const myReqId = ++requestIdRef.current;

    try {
      setLoading(true);
      setError(null);

      // 1) PERFIL BASE (rápido) ✅
      const res = await api.get<MeResponse>('/auth/me', {
        headers: { 'Cache-Control': 'no-cache' },
      });

      if (!mountedRef.current || requestIdRef.current !== myReqId) return;

      const u = res.data.user;
      const r = u.role ?? null;

      setRole(r);
      setName(u.name ?? '');
      setSurname(u.surname ?? '');
      setEmail(u.email);
      setPhone(u.phone ?? '');

      // reset extras
      setKycStatus(null);
      setBackgroundCheck(null);
      setSubscription(null);

      // ✅ liberamos UI apenas tenemos el perfil base
      setLoading(false);

      // 2) EXTRAS (background) ✅
      if (r === 'SPECIALIST') {
        setSubscriptionLoading(true);

        const [specRes, subRes] = await Promise.allSettled([
          api.get<any>('/specialists/me', { headers: { 'Cache-Control': 'no-cache' } }),
          getMySubscription(),
        ]);

        if (!mountedRef.current || requestIdRef.current !== myReqId) return;

        if (specRes.status === 'fulfilled') {
          const rr = specRes.value;
          const p = rr.data?.profile ?? rr.data;
          setAvatarUrl(p?.avatarUrl ?? null);
          setKycStatus((p?.kycStatus ?? null) as KycStatus | null);
          setBackgroundCheck((p?.backgroundCheck ?? null) as BackgroundCheckInfo);
        } else {
          if (__DEV__) console.log('[Profile] /specialists/me error', specRes.reason);
          setAvatarUrl(null);
        }

        if (subRes.status === 'fulfilled') {
          setSubscription(subRes.value as SubscriptionInfo);
        } else {
          if (__DEV__) console.log('[Profile] subscription error', subRes.reason);
          setSubscription(null);
        }

        setSubscriptionLoading(false);
      } else if (r === 'CUSTOMER') {
        const custRes = await api.get<any>('/customers/me', {
          headers: { 'Cache-Control': 'no-cache' },
        });

        if (!mountedRef.current || requestIdRef.current !== myReqId) return;

        const rr = custRes;
        const cust = rr.data?.profile ?? rr.data?.customer ?? rr.data;
        const maybeAvatar =
          cust?.avatarUrl ??
          cust?.avatar_url ??
          cust?.avatar ??
          cust?.photoUrl ??
          rr.data?.avatarUrl ??
          rr.data?.profile?.avatarUrl ??
          rr.data?.customer?.avatarUrl ??
          null;

        setAvatarUrl(maybeAvatar);
      } else {
        setAvatarUrl(null);
      }
    } catch (e: any) {
      if (__DEV__) console.log('[Profile] loadProfile error', e?.response?.data ?? e);

      if (!mountedRef.current) return;

      setError(e?.message ?? 'No se pudo cargar el perfil');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadProfile();
    return () => {
      mountedRef.current = false;
    };
  }, [loadProfile]);

  const onSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await api.patch('/auth/profile', {
        phone: phone.trim() || undefined,
      });

      Alert.alert('Listo', 'Perfil actualizado correctamente');
    } catch (e: any) {
      if (__DEV__) console.log('[Profile] PATCH /auth/profile error', e?.response?.data ?? e);
      setError(e?.response?.data?.error ?? e?.message ?? 'No se pudo actualizar el perfil');
      Alert.alert('Error', 'No se pudo actualizar el perfil');
    } finally {
      setSaving(false);
    }
  };

  const onChangePassword = async () => {
    if (!currentPassword || !newPassword || !newPassword2) {
      return Alert.alert('Atención', 'Completá todos los campos.');
    }
    if (newPassword !== newPassword2) {
      return Alert.alert('Atención', 'La nueva contraseña no coincide.');
    }
    if (newPassword.length < 6) {
      return Alert.alert('Atención', 'La nueva contraseña debe tener al menos 6 caracteres.');
    }

    try {
      setChangingPassword(true);
      const res = await api.patch('/auth/password', {
        currentPassword,
        newPassword,
      });
      if (res.data?.ok) {
        Alert.alert('Listo', 'Contraseña actualizada correctamente.');
        setCurrentPassword('');
        setNewPassword('');
        setNewPassword2('');
        setShowPasswordForm(false);
      } else {
        Alert.alert('Error', 'No se pudo actualizar la contraseña.');
      }
    } catch (e: any) {
      const serverErr = e?.response?.data?.error;

      if (__DEV__) {
        console.log('[Profile] PATCH /auth/password failed:', e?.response?.data ?? e);
      }

      if (serverErr === 'invalid_current_password') {
        Alert.alert('Error', 'La contraseña actual no es correcta.');
      } else {
        Alert.alert('Error', serverErr ?? e?.message ?? 'No se pudo actualizar la contraseña.');
      }
    } finally {
      setChangingPassword(false);
    }
  };

  // subir avatar (especialista o cliente)
  const uploadAvatarFromAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!asset?.uri) return;

    if (!isSpecialist && !isCustomer) {
      Alert.alert('Atención', 'No se pudo determinar tu rol para subir la foto.');
      return;
    }

    try {
      const uri = asset.uri;
      const nameFile = uri.split('/').pop() ?? 'avatar.jpg';
      const type = (asset as any).mimeType ?? 'image/jpeg';

      const form = new FormData();
      form.append('avatar', {
        uri,
        name: nameFile,
        type,
      } as any);

      const endpoint = isSpecialist ? '/specialists/me/avatar' : '/customers/me/avatar';

      const res = await api.post(endpoint, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const newUrl = isSpecialist
        ? (res.data?.avatarUrl as string | undefined)
        : (res.data?.profile?.avatarUrl as string | undefined);

      if (res.data?.ok && newUrl) {
        setAvatarUrl(newUrl);
        Alert.alert('Listo', 'Foto de perfil actualizada.');
      } else {
        Alert.alert('Error', 'No se pudo actualizar la foto de perfil.');
      }
    } catch (e: any) {
      if (__DEV__) console.log('[Profile] upload avatar error', e?.response?.data ?? e);
      Alert.alert('Error', e?.response?.data?.error ?? e?.message ?? 'No se pudo subir la imagen.');
    }
  };

  const onPickAvatar = async () => {
    if (!isSpecialist && !isCustomer) {
      return Alert.alert(
        'Atención',
        'La foto de perfil está disponible para especialistas y clientes.',
      );
    }

    Alert.alert(
      'Cambiar foto de perfil',
      'Elegí una opción',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Tomar foto',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              return Alert.alert(
                'Permiso requerido',
                'Necesitamos acceso a la cámara para tomar una foto.',
              );
            }

            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
            });

            if (result.canceled) return;
            const asset = result.assets?.[0];
            if (!asset) return;
            await uploadAvatarFromAsset(asset);
          },
        },
        {
          text: 'Elegir de la galería',
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
              return Alert.alert(
                'Permiso requerido',
                'Necesitamos acceso a tu galería para cambiar la foto de perfil.',
              );
            }

            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
            });

            if (result.canceled) return;
            const asset = result.assets?.[0];
            if (!asset) return;
            await uploadAvatarFromAsset(asset);
          },
        },
      ],
      { cancelable: true },
    );
  };

  const roleLabel =
    role === 'SPECIALIST' ? 'Especialista' : role === 'CUSTOMER' ? 'Cliente' : 'Usuario';

  if (loading) {
    return (
      <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
        <SafeAreaView style={styles.center}>
          <ActivityIndicator color="#E9FEFF" />
          <Text style={{ color: '#E9FEFF', marginTop: 8 }}>Cargando perfil…</Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (error) {
    return (
      <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
        <SafeAreaView style={styles.center}>
          <Text style={{ color: '#FFECEC', fontWeight: '800' }}>Error</Text>
          <Text style={{ color: '#FFECEC', marginTop: 6 }}>{error}</Text>
          <Pressable onPress={loadProfile} style={styles.retryBtn}>
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const initials =
    (name?.trim()?.[0] ?? '').toUpperCase() + (surname?.trim()?.[0] ?? '').toUpperCase();

  const abs = absoluteUrl(avatarUrl);
  const avatarSrc = abs ? { uri: abs } : require('../assets/avatar-placeholder.png');

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, paddingTop: insets.top + 6 }}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Perfil</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 32 + insets.bottom + 70,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar + datos */}
          <View style={styles.card}>
            <View style={styles.avatarRow}>
              <View style={styles.avatarCircle}>
                {abs ? (
                  <Image
                    source={avatarSrc}
                    style={{ width: 60, height: 60, borderRadius: 30 }}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={styles.avatarInitials}>{initials || 'SU'}</Text>
                )}
              </View>

              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.nameText}>
                  {(name || 'Sin nombre') + (surname ? ' ' + surname : '')}
                </Text>
                <Text style={styles.roleText}>{roleLabel}</Text>
              </View>

              {(isSpecialist || isCustomer) && (
                <Pressable onPress={onPickAvatar} style={styles.photoBtn}>
                  <Ionicons name="camera-outline" size={18} color="#015A69" />
                </Pressable>
              )}
            </View>

            {/* Campos editables */}
            <View style={{ marginTop: 16, gap: 12 }}>
              <View>
                <Text style={styles.label}>Nombre</Text>
                <TextInput
                  value={name}
                  editable={false}
                  selectTextOnFocus={false}
                  style={[styles.input, { opacity: 0.8 }]}
                />
              </View>

              <View>
                <Text style={styles.label}>Apellido</Text>
                <TextInput
                  value={surname}
                  editable={false}
                  selectTextOnFocus={false}
                  style={[styles.input, { opacity: 0.8 }]}
                />
              </View>

              <View>
                <Text style={styles.label}>Correo electrónico</Text>
                <TextInput
                  value={email}
                  editable={false}
                  selectTextOnFocus={false}
                  style={[styles.input, { opacity: 0.8 }]}
                />
                <Text style={styles.helper}>El correo no puede modificarse desde aquí.</Text>
              </View>

              <View>
                <Text style={styles.label}>Teléfono</Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Teléfono"
                  keyboardType="phone-pad"
                  placeholderTextColor="rgba(233,254,255,0.6)"
                  style={styles.input}
                />
              </View>

              <Pressable
                onPress={onSave}
                style={[styles.saveBtn, saving && { opacity: 0.7 }]}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#015A69" />
                ) : (
                  <Text style={styles.saveText}>Guardar cambios</Text>
                )}
              </Pressable>
            </View>
          </View>

          {/* ✅ Verificación KYC (solo especialista) */}
          {isSpecialist ? (
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <MDI name="account-check-outline" size={18} color="#E9FEFF" />
                <Text style={styles.sectionTitle}>Verificación de Identidad</Text>
              </View>

              <ProfileRow
                icon={<Ionicons name={kycIcon(kycStatus)} size={20} color="#E9FEFF" />}
                label={`Estado: ${kycLabel(kycStatus)}`}
                onPress={() => navigation.navigate('KycStatus')}
              />

              <Text style={styles.muted}>
                Verificá tu identidad para operar sin limitaciones y generar más confianza.
              </Text>
            </View>
          ) : null}

          {isSpecialist ? (
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <MDI name="file-document-outline" size={18} color="#E9FEFF" />
                <Text style={styles.sectionTitle}>Certificado de buena conducta</Text>
              </View>

              <Text style={styles.muted}>
                Para activar tu disponibilidad, necesitás tener el antecedente aprobado.
              </Text>

              <View style={{ marginTop: 10 }}>
                <Text style={{ color: '#E9FEFF', fontWeight: '800' }}>
                  Estado:{' '}
                  {backgroundCheck?.status === 'APPROVED'
                    ? 'Aprobado ✅'
                    : backgroundCheck?.status === 'PENDING'
                      ? 'En revisión'
                      : backgroundCheck?.status === 'REJECTED'
                        ? 'Rechazado'
                        : 'No cargado'}
                </Text>

                {backgroundCheck?.status === 'REJECTED' && backgroundCheck?.rejectionReason ? (
                  <Text style={[styles.muted, { marginTop: 6 }]}>
                    Motivo: {backgroundCheck.rejectionReason}
                  </Text>
                ) : null}
              </View>

              <Pressable
                onPress={() => navigation.navigate('BackgroundCheck')}
                style={[styles.saveBtn, bgUploading && { opacity: 0.7 }]}
                disabled={bgUploading}
              >
                <Text style={styles.saveText}>
                  {backgroundCheck ? 'Ver / actualizar certificado' : 'Subir certificado'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {/* ✅ Suscripción (solo especialista) */}
          {isSpecialist ? (
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <MDI name="crown-outline" size={18} color="#E9FEFF" />
                <Text style={styles.sectionTitle}>Suscripción</Text>
              </View>

              {subscriptionLoading ? (
                <View style={{ paddingVertical: 8 }}>
                  <ActivityIndicator color="#E9FEFF" />
                  <Text style={[styles.muted, { marginTop: 8 }]}>Cargando suscripción…</Text>
                </View>
              ) : subscription ? (
                <View style={{ marginTop: 4, gap: 6 }}>
                  <View style={styles.subPill}>
                    <Text style={styles.subPillText}>
                      {subscription.status === 'TRIALING'
                        ? 'Período de prueba'
                        : subscription.status === 'ACTIVE'
                          ? 'Suscripción activa'
                          : subscription.status === 'PAST_DUE'
                            ? 'Pago pendiente'
                            : 'Suscripción inactiva'}
                    </Text>
                  </View>

                  <Text style={styles.subMainText}>{renderSubscriptionMainText(subscription)}</Text>

                  {subscription.status === 'TRIALING' &&
                  typeof subscription.daysRemaining === 'number' ? (
                    <Text style={styles.subSecondaryText}>
                      Te quedan{' '}
                      <Text style={styles.subDaysHighlight}>
                        {subscription.daysRemaining <= 0
                          ? 'menos de 1 día'
                          : `${subscription.daysRemaining} días`}
                      </Text>{' '}
                      de prueba.
                    </Text>
                  ) : null}

                  {subscription.status === 'ACTIVE' && subscription.currentPeriodEnd ? (
                    <Text style={styles.subSecondaryText}>
                      Próxima renovación: {formatDate(subscription.currentPeriodEnd)}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <Text style={styles.muted}>
                  No pudimos cargar tu suscripción. Probá de nuevo más tarde.
                </Text>
              )}
              <Pressable
                onPress={() => navigation.navigate('Subscription')}
                style={[styles.saveBtn, { marginTop: 12 }]}
              >
                <Text style={styles.saveText}>Ver suscripción</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Cuenta y seguridad */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <MDI name="shield-lock-outline" size={18} color="#E9FEFF" />
              <Text style={styles.sectionTitle}>Cuenta y seguridad</Text>
            </View>

            <ProfileRow
              icon={<Ionicons name="lock-closed-outline" size={20} color="#E9FEFF" />}
              label="Cambiar contraseña"
              onPress={() => setShowPasswordForm((v) => !v)}
            />

            {showPasswordForm && (
              <View style={{ marginTop: 8, gap: 8 }}>
                <TextInput
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="Contraseña actual"
                  secureTextEntry
                  placeholderTextColor="rgba(233,254,255,0.6)"
                  style={styles.input}
                />
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Nueva contraseña"
                  secureTextEntry
                  placeholderTextColor="rgba(233,254,255,0.6)"
                  style={styles.input}
                />
                <TextInput
                  value={newPassword2}
                  onChangeText={setNewPassword2}
                  placeholder="Repetir nueva contraseña"
                  secureTextEntry
                  placeholderTextColor="rgba(233,254,255,0.6)"
                  style={styles.input}
                />
                <Pressable
                  onPress={onChangePassword}
                  style={[
                    styles.saveBtn,
                    { marginTop: 4, backgroundColor: '#E9FEFF' },
                    changingPassword && { opacity: 0.7 },
                  ]}
                  disabled={changingPassword}
                >
                  {changingPassword ? (
                    <ActivityIndicator color="#015A69" />
                  ) : (
                    <Text style={styles.saveText}>Actualizar contraseña</Text>
                  )}
                </Pressable>
              </View>
            )}

            <View style={styles.rowItem}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="notifications-outline" size={20} color="#E9FEFF" />
                <Text style={styles.rowLabel}>Notificaciones</Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: 'rgba(255,255,255,0.3)', true: '#E9FEFF' }}
                thumbColor={notificationsEnabled ? '#015A69' : '#f4f3f4'}
              />
            </View>
          </View>

          {/* Ayuda y legal */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <MDI name="help-circle-outline" size={18} color="#E9FEFF" />
              <Text style={styles.sectionTitle}>Ayuda y legal</Text>
            </View>

            <ProfileRow
              icon={<Ionicons name="chatbox-ellipses-outline" size={20} color="#E9FEFF" />}
              label="Soporte técnico"
              onPress={() => navigation.navigate('Support')}
            />

            <ProfileRow
              icon={<Ionicons name="document-text-outline" size={20} color="#E9FEFF" />}
              label="Términos y condiciones"
              onPress={() => navigation.navigate('Terms')}
            />

            <ProfileRow
              icon={<Ionicons name="shield-checkmark-outline" size={20} color="#E9FEFF" />}
              label="Política de privacidad"
              onPress={() => navigation.navigate('PrivacyPolicy')}
            />
          </View>

          {/* Cerrar sesión */}
          <View style={styles.card}>
            <Pressable
              style={styles.logoutBtn}
              onPress={() => {
                Alert.alert('Cerrar sesión', '¿Seguro que querés cerrar sesión?', [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Cerrar sesión',
                    style: 'destructive',
                    onPress: async () => {
                      await (signOut?.() ?? Promise.resolve());
                    },
                  },
                ]);
              }}
            >
              <Ionicons name="log-out-outline" size={20} color="#fff" />
              <Text style={styles.logoutText}>Cerrar sesión</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function ProfileRow(props: { icon: React.ReactNode; label: string; onPress?: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.rowItem,
        pressed && { backgroundColor: 'rgba(233,254,255,0.05)' },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {props.icon}
        <Text style={styles.rowLabel}>{props.label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#E9FEFF" />
    </Pressable>
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
  retryBtn: {
    marginTop: 10,
    backgroundColor: '#E9FEFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  retryText: { color: '#06494F', fontWeight: '800' },

  card: {
    backgroundColor: 'rgba(0, 35, 40, 0.32)',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },

  avatarRow: { flexDirection: 'row', alignItems: 'center' },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(233,254,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarInitials: { color: '#E9FEFF', fontWeight: '800', fontSize: 22 },
  nameText: { color: '#E9FEFF', fontSize: 18, fontWeight: '800' },
  roleText: { color: 'rgba(233,254,255,0.8)', marginTop: 2 },
  photoBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#E9FEFF',
  },

  label: { color: 'rgba(233,254,255,0.9)', marginBottom: 4, fontSize: 13 },
  input: {
    backgroundColor: 'rgba(0, 35, 40, 0.6)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#E9FEFF',
  },
  helper: { color: 'rgba(233,254,255,0.7)', fontSize: 11, marginTop: 4 },

  saveBtn: {
    marginTop: 8,
    backgroundColor: '#E9FEFF',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveText: { color: '#015A69', fontWeight: '800' },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: { color: '#E9FEFF', fontWeight: '800', fontSize: 16 },

  rowItem: {
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: { color: 'rgba(233,254,255,0.95)' },

  muted: { color: '#9ec9cd' },

  // suscripción
  subPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  subPillText: {
    color: '#E9FEFF',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  subMainText: {
    color: '#E9FEFF',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
  },
  subSecondaryText: { color: '#B5DADD', fontSize: 13, marginTop: 4 },
  subDaysHighlight: { fontWeight: '800', color: '#FFE29B' },

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#ff3b30',
  },
  logoutText: { color: '#fff', fontWeight: '800' },
});
