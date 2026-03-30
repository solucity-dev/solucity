// apps/mobile/src/screens/RegisterSpecialist.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Easing,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView as RNScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthProvider';
import { LOCALITIES_CORDOBA } from '../data/localitiesCordoba';
import { api } from '../lib/api';
import { registerForPush } from '../notifications/registerForPush';

type Step = 1 | 2 | 3;
type KycUploadRes = { ok: true; url: string };
type Category = { id: string; name: string; slug: string };
type CategoryGroup = { id: string; name: string; slug: string; categories: Category[] };
type CategoriesRes = { ok: true; groups: CategoryGroup[] };

const REGISTER_DRAFT_KEY = 'register_specialist_draft_v1';
const REGISTER_PENDING_FIELD_KEY = 'register_specialist_pending_field_v1';
const REGISTER_CAPTURE_RESULT_KEY = 'register_specialist_capture_result_v1';

export default function RegisterSpecialist() {
  const insets = useSafeAreaInsets();

  const navigation = useNavigation<any>();

  const { setMode, login } = useAuth();

  const [step, setStep] = useState<Step>(1);

  const scrollRef = useRef<any>(null);

  const saveDraft = async (patch: Record<string, any> = {}) => {
    try {
      const currentRaw = await AsyncStorage.getItem(REGISTER_DRAFT_KEY);
      const current = currentRaw ? JSON.parse(currentRaw) : {};
      const next = { ...current, ...patch };
      await AsyncStorage.setItem(REGISTER_DRAFT_KEY, JSON.stringify(next));
    } catch (e) {
      console.log('[register-specialist][draft][save-error]', e);
    }
  };

  const clearDraft = async () => {
    try {
      await AsyncStorage.multiRemove([REGISTER_DRAFT_KEY, REGISTER_PENDING_FIELD_KEY]);
    } catch (e) {
      console.log('[register-specialist][draft][clear-error]', e);
    }
  };

  // ===== UI: progreso animado =====
  const progressAnim = useRef(new Animated.Value(1 / 3)).current;

  useEffect(() => {
    console.log('[register-specialist] mount');

    const restoreDraft = async () => {
      try {
        const raw = await AsyncStorage.getItem(REGISTER_DRAFT_KEY);
        if (!raw) {
          console.log('[register-specialist][draft] no hay draft guardado');
          return;
        }

        const draft = JSON.parse(raw);
        console.log('[register-specialist][draft] restaurando', draft);

        if (draft.email) setEmail(draft.email);
        if (typeof draft.otpSent === 'boolean') setOtpSent(draft.otpSent);
        if (draft.otp) setOtp(draft.otp);
        if (draft.name) setName(draft.name);
        if (draft.surname) setSurname(draft.surname);
        if (draft.phone) setPhone(draft.phone);
        if (draft.password) setPassword(draft.password);
        if (draft.password2) setPassword2(draft.password2);
        if (draft.pendingToken) setPendingToken(draft.pendingToken);
        if (draft.step) setStep(draft.step);
        if (draft.dniFront) setDniFront(draft.dniFront);
        if (draft.dniBack) setDniBack(draft.dniBack);
        if (draft.selfie) setSelfie(draft.selfie);
        if (draft.kycUrls) setKycUrls(draft.kycUrls);
      } catch (e) {
        console.log('[register-specialist][draft][restore-error]', e);
      }
    };

    restoreDraft();
  }, []);

  useEffect(() => {
    const target = step / 3;
    Animated.timing(progressAnim, {
      toValue: target,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    requestAnimationFrame(() => {
      scrollRef.current?.scrollToPosition?.(0, 0, true);
      scrollRef.current?.scrollTo?.({ y: 0, animated: true });
    });
  }, [step, progressAnim]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      console.log('[register-specialist][AppState]', state);
    });

    return () => sub.remove();
  }, []);

  // ===== PASO 1: identidad + OTP ===========================================
  const [email, setEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');

  // ✅ ojitos
  const [showPass1, setShowPass1] = useState(false);
  const [showPass2, setShowPass2] = useState(false);

  const [loadingStart, setLoadingStart] = useState(false);
  const [loadingVerify, setLoadingVerify] = useState(false);
  const [emailHelp, setEmailHelp] = useState<string | null>(null);
  const [otpHelp, setOtpHelp] = useState<string | null>(null);

  // token temporal que nos da /auth/register/verify
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  // ✅ checks paso 1
  const step1Checks = useMemo(() => {
    const checks = [
      { ok: email.trim().includes('@'), label: 'Email' },
      { ok: otpSent, label: 'Código enviado' },
      { ok: otp.trim().length === 6, label: 'Código 6 dígitos' },
      { ok: name.trim().length >= 2, label: 'Nombre' },
      { ok: password.length >= 8, label: 'Contraseña (8+)' },
      { ok: password.length >= 8 && password === password2, label: 'Confirmación' },
    ];
    return checks;
  }, [email, otpSent, otp, name, password, password2]);

  const sendCode = async () => {
    if (loadingStart) return;
    try {
      Keyboard.dismiss();
      setLoadingStart(true);
      setEmailHelp(null);
      setOtpHelp(null);

      const trimmed = email.trim().toLowerCase();
      if (!trimmed.includes('@')) {
        setEmailHelp('Revisá el correo: parece incompleto o inválido.');
        return Alert.alert('Email inválido', 'Ingresá un correo válido.');
      }

      await api.post('/auth/register/start', { email: trimmed });
      setOtpSent(true);
      setEmailHelp(`Enviamos un código a ${trimmed}. Revisá también spam o promociones.`);
      Alert.alert('Código enviado', 'Revisá tu correo y pegá el código.');
    } catch (e: any) {
      const err = e?.response?.data?.error;
      if (e?.response?.status === 409 || err === 'email_in_use') {
        setEmailHelp('Ese correo ya está registrado. Probá iniciar sesión o recuperar tu clave.');
        return Alert.alert(
          'Correo ya registrado',
          'Ese correo ya está en uso. Probá iniciar sesión.',
        );
      }
      if (e?.response?.status === 429 || err === 'too_many_requests') {
        setEmailHelp(
          'Hiciste muchos intentos. Esperá unos minutos antes de volver a pedir el código.',
        );
        return Alert.alert('Demasiados intentos', 'Esperá unos minutos y reintentá.');
      }
      setEmailHelp(
        'No pudimos enviar el código. Revisá si el correo está bien escrito e intentá nuevamente.',
      );
      Alert.alert('Error', 'No se pudo enviar el código.');
    } finally {
      setLoadingStart(false);
    }
  };
  const verifyAndContinue = async () => {
    if (loadingVerify || pendingToken) return;
    try {
      Keyboard.dismiss();
      setLoadingVerify(true);
      setOtpHelp(null);

      if (!otp || otp.length < 6) {
        setOtpHelp('El código debe tener 6 dígitos.');
        return Alert.alert('Código inválido', 'Ingresá los 6 dígitos.');
      }
      if (!name.trim()) return Alert.alert('Falta tu nombre', 'Ingresá tu nombre.');
      if (!password || password.length < 8)
        return Alert.alert('Contraseña inválida', 'Mínimo 8 caracteres.');
      if (password !== password2) return Alert.alert('Las contraseñas no coinciden');

      const r = await api.post('/auth/register/verify', {
        email: email.trim().toLowerCase(),
        code: otp.trim(),
        name: name.trim(),
        surname: surname.trim() ? surname.trim() : undefined,
        phone: phone.trim() ? phone.trim() : undefined,
        password,
        role: 'SPECIALIST',
      });

      const tok = r.data?.token as string | undefined;
      if (!tok) return Alert.alert('Error', 'No se recibió token.');
      setPendingToken(tok);
      await saveDraft({ pendingToken: tok, step: 2 });

      setStep(2);
    } catch (e: any) {
      const err = e?.response?.data?.error;
      if (err === 'otp_already_used') {
        setOtpHelp('Ese código ya fue usado. Pedí uno nuevo.');
        Alert.alert('Código usado', 'Generá uno nuevo y reintentá.');
      } else if (err === 'otp_expired') {
        setOtpHelp('El código venció. Pedí uno nuevo para continuar.');
        Alert.alert('Código vencido', 'Pedí un nuevo código.');
      } else if (err === 'otp_invalid' || err === 'otp_not_found') {
        setOtpHelp('El código no coincide. Revisá los 6 dígitos o volvé a pedir uno.');
        Alert.alert('Código incorrecto', 'Verificá los 6 dígitos.');
      } else if (e?.response?.status === 409) {
        setEmailHelp('Ese correo ya está registrado. Probá iniciar sesión.');
        Alert.alert('Correo ya registrado', 'Ese correo ya está en uso. Probá iniciar sesión.');
      } else if (err === 'weak_password') {
        Alert.alert('Contraseña débil', 'Usá una contraseña de al menos 8 caracteres.');
      } else if (e?.response?.status === 429 || err === 'otp_blocked') {
        setOtpHelp('Hiciste muchos intentos. Esperá unos minutos y pedí un nuevo código.');
        Alert.alert('Demasiados intentos', 'Esperá unos minutos y pedí un nuevo código.');
      } else {
        setOtpHelp(
          'No se pudo verificar el código. Revisá el correo ingresado y volvé a intentar.',
        );
        Alert.alert('Error', 'No se pudo verificar el código.');
      }
    } finally {
      setLoadingVerify(false);
    }
  };

  // ===== PASO 2: KYC (dni frente/dorso/selfie) =============================
  const [dniFront, setDniFront] = useState<string | null>(null);
  const [dniBack, setDniBack] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [loadingUpload, setLoadingUpload] = useState(false);
  const [, setPendingKycField] = useState<'dniFront' | 'dniBack' | 'selfie' | null>(null);

  // ✅ checks paso 2
  const step2Checks = useMemo(
    () => [
      { ok: !!dniFront, label: 'DNI frente' },
      { ok: !!dniBack, label: 'DNI dorso' },
      { ok: !!selfie, label: 'Selfie' },
    ],
    [dniFront, dniBack, selfie],
  );

  const step2Complete = !!dniFront && !!dniBack && !!selfie;

  useFocusEffect(
    useMemo(
      () => () => {
        let cancelled = false;

        const restoreCaptureResult = async () => {
          try {
            const raw = await AsyncStorage.getItem(REGISTER_CAPTURE_RESULT_KEY);
            if (!raw) return;

            const result = JSON.parse(raw);
            if (cancelled) return;

            console.log('[register-specialist] capture result restaurado', result);

            if (result?.field === 'selfie' && result?.uri) {
              setSelfie(result.uri);
            } else if (result?.field === 'dniFront' && result?.uri) {
              setDniFront(result.uri);
            } else if (result?.field === 'dniBack' && result?.uri) {
              setDniBack(result.uri);
            }

            await AsyncStorage.removeItem(REGISTER_CAPTURE_RESULT_KEY);
          } catch (e) {
            console.log('[register-specialist] restoreCaptureResult error', e);
          }
        };

        restoreCaptureResult();

        return () => {
          cancelled = true;
        };
      },
      [],
    ),
  );

  useEffect(() => {
    saveDraft({
      step,
      email,
      otpSent,
      otp,
      name,
      surname,
      phone,
      password,
      password2,
      pendingToken,
      dniFront,
      dniBack,
      selfie,
    });
  }, [
    step,
    email,
    otpSent,
    otp,
    name,
    surname,
    phone,
    password,
    password2,
    pendingToken,
    dniFront,
    dniBack,
    selfie,
  ]);

  // ✅ hint suave paso 2 (exactamente qué falta)
  const [step2Hint, setStep2Hint] = useState<string | null>(null);

  useEffect(() => {
    if (step2Complete) setStep2Hint(null);
  }, [step2Complete]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const restorePendingPickerResult = async () => {
      try {
        const pending = await ImagePicker.getPendingResultAsync();
        const storedField = await AsyncStorage.getItem(REGISTER_PENDING_FIELD_KEY);

        if (!pending) {
          console.log('[ImagePicker] no pending result');
          return;
        }

        if ('code' in pending) {
          console.log('[ImagePicker] pending result error:', pending);
          return;
        }

        if (pending.canceled) {
          console.log('[ImagePicker] pending result canceled');
          await AsyncStorage.removeItem(REGISTER_PENDING_FIELD_KEY);
          setPendingKycField(null);
          return;
        }

        const uri = pending.assets?.[0]?.uri;
        if (!uri) {
          console.log('[ImagePicker] pending result sin uri');
          return;
        }

        console.log('[ImagePicker] pending result restored:', {
          uri,
          storedField,
        });

        if (storedField === 'dniFront') setDniFront(uri);
        else if (storedField === 'dniBack') setDniBack(uri);
        else if (storedField === 'selfie') setSelfie(uri);
        else console.log('[ImagePicker] campo pendiente desconocido:', storedField);

        await AsyncStorage.removeItem(REGISTER_PENDING_FIELD_KEY);
        setPendingKycField(null);
      } catch (e) {
        console.log('[ImagePicker] getPendingResultAsync error', e);
      }
    };

    restorePendingPickerResult();
  }, []);

  const pickFrom = async (
    from: 'camera' | 'gallery',
    setter: (uri: string) => void,
    field: 'dniFront' | 'dniBack' | 'selfie',
    opts?: { cameraType?: ImagePicker.CameraType },
  ) => {
    try {
      console.log('[register-specialist][pickFrom] inicio', { from, field });

      if (Platform.OS !== 'web') {
        if (from === 'camera') {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          console.log('[register-specialist][pickFrom] camera perm', perm);

          if (!perm.granted) {
            return Alert.alert('Permiso requerido', 'Necesitamos acceso a la cámara.');
          }
        } else {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          console.log('[register-specialist][pickFrom] gallery perm', perm);

          if (!perm.granted) {
            return Alert.alert('Permiso requerido', 'Necesitamos acceso a tus fotos.');
          }
        }
      }

      await AsyncStorage.setItem(REGISTER_PENDING_FIELD_KEY, field);
      setPendingKycField(field);

      const fn =
        from === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;

      const res = await fn({
        quality: 0.6,
        allowsMultipleSelection: false,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        cameraType: opts?.cameraType,
        exif: false,
      });

      console.log('[register-specialist][pickFrom] resultado', {
        canceled: 'canceled' in res ? res.canceled : undefined,
        hasAssets: 'assets' in res ? !!res.assets?.length : false,
        field,
      });

      if (!('canceled' in res)) {
        console.log('[register-specialist][pickFrom] respuesta inesperada', res);
        return;
      }

      if (!res.canceled && res.assets?.[0]?.uri) {
        const pickedUri = res.assets[0].uri;
        console.log('[register-specialist][pickFrom] uri seleccionada', pickedUri);
        setter(pickedUri);
      }

      await AsyncStorage.removeItem(REGISTER_PENDING_FIELD_KEY);
      setPendingKycField(null);
    } catch (e) {
      console.log('[register-specialist][pickFrom][error]', e);
      await AsyncStorage.removeItem(REGISTER_PENDING_FIELD_KEY);
      setPendingKycField(null);
      Alert.alert('Error', 'No se pudo abrir la cámara o la galería.');
    }
  };

  // Compresión previa (ayuda en Android) - SOLO imágenes
  const compress = async (uri: string) => {
    if (Platform.OS === 'web') return uri;

    try {
      const r = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1400 } }], {
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      return r.uri;
    } catch {
      return uri;
    }
  };

  // headers con token temporal
  const tempAuthHeaders = () => (pendingToken ? { Authorization: `Bearer ${pendingToken}` } : {});

  // Upload genérico KYC (solo imágenes)
  const upload = async (uri: string): Promise<string> => {
    if (!pendingToken) throw new Error('missing_temp_token');

    const src = await compress(uri);
    const fd = new FormData();
    fd.append('file', { uri: src, name: 'kyc.jpg', type: 'image/jpeg' } as any);

    const r = await api.post<KycUploadRes>('/specialists/kyc/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data', ...tempAuthHeaders() },
      timeout: 60000,
    });

    return r.data.url;
  };

  const [kycUrls, setKycUrls] = useState<{
    dniFrontUrl: string;
    dniBackUrl: string;
    selfieUrl: string;
  } | null>(null);

  const continueToStep3 = async () => {
    try {
      if (!dniFront || !dniBack || !selfie) {
        return Alert.alert('Faltan fotos', 'Subí frente, dorso y selfie.');
      }
      setLoadingUpload(true);

      const [f, b, s] = await Promise.all([upload(dniFront), upload(dniBack), upload(selfie)]);
      const newKycUrls = { dniFrontUrl: f, dniBackUrl: b, selfieUrl: s };
      setKycUrls(newKycUrls);
      await saveDraft({ step: 3, kycUrls: newKycUrls });

      // opcional pro: si existe este endpoint, deja el KYC en PENDING ya mismo.
      // (si no existe, ignoramos silenciosamente)
      try {
        await api.post(
          '/specialists/kyc/submit',
          { dniFrontUrl: f, dniBackUrl: b, selfieUrl: s },
          { headers: { ...tempAuthHeaders() } },
        );
      } catch {}

      setStep(3);
    } catch (e: any) {
      const err = e?.response?.data?.error;
      if (e?.response?.status === 401) Alert.alert('Sesión', 'Volvé a verificar tu email.');
      else if (err === 'low_quality')
        Alert.alert('Imagen muy pequeña', 'Elegí una foto más nítida (mínimo 800×600).');
      else if (err === 'unsupported_type') Alert.alert('Formato no soportado', 'Usá JPG/PNG/WebP.');
      else Alert.alert('Error', 'No se pudo subir la imagen.');
    } finally {
      setLoadingUpload(false);
    }
  };

  // ===== PASO 3: rubros (sin matrícula/título en registro) ==================
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [finalizing, setFinalizing] = useState(false);
  const [serviceQuery, setServiceQuery] = useState('');

  // ===== PASO 3: modalidades de servicio ==================
  const [serviceModes, setServiceModes] = useState<('HOME' | 'OFFICE' | 'ONLINE')[]>([]);
  const [officeAddress, setOfficeAddress] = useState('');
  const [officeLocality, setOfficeLocality] = useState('Río Cuarto');
  const [officeLocalityOpen, setOfficeLocalityOpen] = useState(false);
  const [officeLocalityQuery, setOfficeLocalityQuery] = useState('');

  // ✅ hint suave paso 3
  const [step3Hint, setStep3Hint] = useState<string | null>(null);

  useEffect(() => {
    const hasModes = serviceModes.length > 0;
    const officeOk =
      !serviceModes.includes('OFFICE') ||
      (officeAddress.trim().length > 0 && officeLocality.trim().length > 0);
    const hasRubros = selectedSlugs.length > 0;

    if (hasModes && officeOk && hasRubros) setStep3Hint(null);
  }, [serviceModes, officeAddress, officeLocality, selectedSlugs.length]);

  // ✅ checks paso 3
  const step3Checks = useMemo(
    () => [
      { ok: serviceModes.length > 0, label: 'Modalidades' },
      {
        ok:
          !serviceModes.includes('OFFICE') ||
          (officeAddress.trim().length > 0 && officeLocality.trim().length > 0),
        label: 'Local/oficina',
      },
      { ok: selectedSlugs.length > 0, label: 'Rubros' },
    ],
    [serviceModes, officeAddress, officeLocality, selectedSlugs.length],
  );

  useEffect(() => {
    const load = async () => {
      try {
        const r = await api.get<CategoriesRes>('/categories');
        setGroups(r.data.groups ?? []);
      } catch (e: any) {
        console.log('[categories]', e?.response?.data || e.message);
        setGroups([]);
      }
    };

    load();
  }, []);

  const flatCategories = useMemo(() => {
    return (groups ?? []).flatMap((g) =>
      (g.categories ?? []).map((c) => ({ ...c, group: g.slug })),
    );
  }, [groups]);

  const normalizedQuery = useMemo(() => normalizeText(serviceQuery ?? ''), [serviceQuery]);

  const filteredCategories = useMemo(() => {
    const base = [...flatCategories];

    const filtered = !normalizedQuery
      ? base
      : base.filter((c) => {
          const name = normalizeText(c.name ?? '');
          const slug = normalizeText(c.slug ?? '');
          const group = normalizeText(c.group ?? '');

          return (
            name.includes(normalizedQuery) ||
            slug.includes(normalizedQuery) ||
            group.includes(normalizedQuery)
          );
        });

    return filtered.sort((a, b) => {
      const aSelected = selectedSlugs.includes(a.slug) ? 1 : 0;
      const bSelected = selectedSlugs.includes(b.slug) ? 1 : 0;

      if (aSelected !== bSelected) return bSelected - aSelected;

      return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
    });
  }, [flatCategories, normalizedQuery, selectedSlugs]);

  const selectedCategories = useMemo(() => {
    return flatCategories
      .filter((c) => selectedSlugs.includes(c.slug))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }, [flatCategories, selectedSlugs]);

  const toggleSlug = (slug: string) => {
    setSelectedSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  };

  const toggleServiceMode = (mode: 'HOME' | 'OFFICE' | 'ONLINE') => {
    setServiceModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode],
    );
  };

  const buildOfficeAddressPayload = () => {
    const street = officeAddress.trim();
    const locality = officeLocality.trim() || 'Río Cuarto';

    if (!street) return null;

    return {
      formatted: street,
      locality,
    };
  };

  function normalizeText(text: string = '') {
    return String(text)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  const filteredOfficeLocalities = useMemo(() => {
    const q = normalizeText(officeLocalityQuery);
    if (!q) return LOCALITIES_CORDOBA;

    return LOCALITIES_CORDOBA.filter((x) => normalizeText(x).includes(q));
  }, [officeLocalityQuery]);

  /**
   * ✅ MÁS SEGURO:
   * - registramos el push token "a demanda" después del login
   * - esto evita depender del timing del NotificationsProvider
   */
  const ensurePushTokenRegistered = async () => {
    if (Platform.OS === 'web') return;

    try {
      const pushToken = await registerForPush();
      if (!pushToken) return;

      await api.post(
        '/notifications/push-token',
        { token: pushToken, platform: Platform.OS },
        { headers: { ...tempAuthHeaders(), 'Cache-Control': 'no-cache' } },
      );
    } catch {
      // no frenamos el flujo por esto
    }
  };

  const finalize = async () => {
    if (finalizing) return;
    try {
      Keyboard.dismiss();

      if (!pendingToken)
        return Alert.alert('Error', 'Sesión pendiente perdida. Reintentá el registro.');
      if (!kycUrls) return Alert.alert('Error', 'Faltan las imágenes de identidad.');

      if (serviceModes.length === 0) {
        setStep3Hint('Elegí al menos una modalidad de servicio para continuar.');
        return Alert.alert(
          'Falta un paso',
          'Elegí al menos una modalidad de servicio para poder finalizar.',
        );
      }

      if (serviceModes.includes('OFFICE') && !officeAddress.trim()) {
        setStep3Hint('Si trabajás en oficina/local, cargá la dirección.');
        return Alert.alert(
          'Falta la dirección',
          'Completá la dirección de tu oficina o local para continuar.',
        );
      }

      if (selectedSlugs.length === 0) {
        setStep3Hint('Elegí al menos un rubro para continuar.');
        return Alert.alert('Falta un paso', 'Elegí al menos un rubro para poder finalizar.');
      }

      setFinalizing(true);

      const officeAddressPayload = serviceModes.includes('OFFICE')
        ? buildOfficeAddressPayload()
        : null;

      const r2 = await api.post(
        '/specialists/register',
        {
          specialties: selectedSlugs,
          serviceModes,
          officeAddress: officeAddressPayload,
          bio: '',
          kyc: kycUrls,
        },
        { headers: { ...tempAuthHeaders() } },
      );

      const newToken = r2.data?.token as string | undefined;
      const tokenToUse = newToken ?? pendingToken;

      // ✅ 1) login real + modo especialista
      await login(tokenToUse);
      await setMode('specialist');

      // ✅ 2) aseguramos push token YA
      await ensurePushTokenRegistered();

      // ✅ 3) re-disparo submit (para que dispare push "PENDING" sí o sí)
      try {
        await api.post('/specialists/kyc/submit', kycUrls, { headers: { ...tempAuthHeaders() } });
      } catch {}

      await clearDraft();
    } catch (e: any) {
      console.log('[specialists/register]', e?.response?.data || e.message);
      Alert.alert('Error', e?.response?.data?.error ?? 'No se pudo finalizar el registro.');
    } finally {
      setFinalizing(false);
    }
  };

  const goToPreviousStep = async () => {
    if (step === 2) {
      await saveDraft({ step: 1 });
      setStep(1);
      return;
    }

    if (step === 3) {
      await saveDraft({ step: 2 });
      setStep(2);
    }
  };
  const checksForStep = step === 1 ? step1Checks : step === 2 ? step2Checks : step3Checks;

  // ===== UI ================================================================
  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <KeyboardAwareScrollView
        ref={scrollRef}
        enableOnAndroid={Platform.OS === 'android'}
        extraScrollHeight={Platform.OS === 'web' ? 0 : 18}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: 16,
          paddingTop: insets.top + 8,
          paddingBottom: Platform.OS === 'web' ? 32 : insets.bottom + 140,
        }}
      >
        <Text style={s.h1}>Registro especialista</Text>

        {/* ✅ progreso animado */}
        <View style={{ marginTop: 8, marginBottom: 10 }}>
          <View style={s.progressTrack}>
            <Animated.View
              style={[
                s.progressFill,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>

          <View style={s.progressRow}>
            <Text style={s.h2}>Paso {step} de 3</Text>
            <View style={s.stepDots}>
              <Dot active={step >= 1} />
              <Dot active={step >= 2} />
              <Dot active={step >= 3} />
            </View>
          </View>
        </View>

        {/* ✅ mini checks */}
        <View style={s.checksWrap}>
          {checksForStep.map((c) => (
            <MiniCheck key={c.label} ok={c.ok} label={c.label} />
          ))}
        </View>

        {step === 1 && (
          <View style={s.card}>
            <Text style={s.label}>Correo electrónico</Text>
            <TextInput
              style={s.input}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (emailHelp) setEmailHelp(null);
              }}
              placeholder="especialista@correo.com"
              placeholderTextColor="#cfe"
              returnKeyType="send"
              onSubmitEditing={sendCode}
              textContentType="emailAddress"
              autoComplete="email"
              editable={!loadingStart && !loadingVerify}
            />

            {emailHelp ? <Text style={s.inlineHelp}>{emailHelp}</Text> : null}

            {!otpSent ? (
              <Pressable
                onPress={sendCode}
                disabled={loadingStart}
                style={[s.btn, loadingStart && s.disabled]}
              >
                <Text style={s.btnT}>{loadingStart ? 'Enviando…' : 'Enviar código'}</Text>
              </Pressable>
            ) : (
              <>
                <Text style={s.label}>Código (6 dígitos)</Text>
                <TextInput
                  style={s.input}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={otp}
                  onChangeText={(t) => {
                    setOtp(t.replace(/\D/g, '').slice(0, 6));
                    if (otpHelp) setOtpHelp(null);
                  }}
                  placeholder="••••••"
                  placeholderTextColor="#cfe"
                  returnKeyType="next"
                  textContentType="oneTimeCode"
                  editable={!loadingVerify}
                />

                <Text style={s.label}>Nombre</Text>
                <TextInput
                  style={s.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Tu nombre"
                  placeholderTextColor="#cfe"
                  returnKeyType="next"
                />

                <Text style={s.label}>Apellido (opcional)</Text>
                <TextInput
                  style={s.input}
                  value={surname}
                  onChangeText={setSurname}
                  placeholder="Tu apellido"
                  placeholderTextColor="#cfe"
                  returnKeyType="next"
                />

                <Text style={s.label}>Teléfono (opcional)</Text>
                <TextInput
                  style={s.input}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+54 11 1234-5678"
                  placeholderTextColor="#cfe"
                  returnKeyType="next"
                />

                <Text style={s.label}>Contraseña</Text>
                <PasswordInputRow
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Requiere 8 caracteres, 1 letra y 1 número"
                  visible={showPass1}
                  onToggle={() => setShowPass1((v) => !v)}
                  onSubmitEditing={() => {}}
                  returnKeyType="next"
                  textContentType="newPassword"
                  autoComplete="new-password"
                />

                <Text style={s.passHelp}>Requiere 8 caracteres, al menos 1 letra y 1 número.</Text>

                <Text style={s.label}>Confirmar contraseña</Text>
                <PasswordInputRow
                  value={password2}
                  onChangeText={setPassword2}
                  placeholder="Repetí la contraseña"
                  visible={showPass2}
                  onToggle={() => setShowPass2((v) => !v)}
                  onSubmitEditing={verifyAndContinue}
                  returnKeyType="done"
                  textContentType="newPassword"
                  autoComplete="new-password"
                />

                <Pressable
                  onPress={verifyAndContinue}
                  disabled={loadingVerify}
                  style={[s.btn, { marginTop: 8 }, loadingVerify && s.disabled]}
                >
                  <Text style={s.btnT}>
                    {loadingVerify ? 'Verificando…' : 'Continuar ▸ Paso 2'}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        )}

        {step === 2 && (
          <View style={s.card}>
            {Platform.OS === 'web' && (
              <View style={s.infoBox}>
                <Text style={s.infoText}>
                  Desde el navegador podés subir fotos sacándolas con la cámara del teléfono o
                  eligiéndolas desde tu galería.
                </Text>
              </View>
            )}

            <PickBoxKyc
              label="DNI frente"
              mode="dni"
              uri={dniFront}
              onPickCamera={() =>
                pickFrom('camera', setDniFront, 'dniFront', {
                  cameraType: ImagePicker.CameraType.back,
                })
              }
              onPickGallery={() => pickFrom('gallery', setDniFront, 'dniFront')}
              onClear={() => setDniFront(null)}
            />

            <PickBoxKyc
              label="DNI dorso"
              mode="dni"
              uri={dniBack}
              onPickCamera={() =>
                pickFrom('camera', setDniBack, 'dniBack', {
                  cameraType: ImagePicker.CameraType.back,
                })
              }
              onPickGallery={() => pickFrom('gallery', setDniBack, 'dniBack')}
              onClear={() => setDniBack(null)}
            />

            <PickBoxKyc
              label="Selfie"
              mode="selfie"
              uri={selfie}
              onPickCamera={() => navigation.navigate('SelfieCapture')}
              onPickGallery={() => pickFrom('gallery', setSelfie, 'selfie')}
              onClear={() => setSelfie(null)}
            />

            {step2Hint ? <Text style={s.hint}>{step2Hint}</Text> : null}

            <View style={s.actionsRow}>
              <Pressable onPress={goToPreviousStep} style={[s.btn, s.btnSecondary, s.halfBtn]}>
                <Text style={s.btnSecondaryT}>◂ Volver</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  if (!step2Complete) {
                    setStep2Hint('Subí DNI frente, dorso y selfie para continuar.');
                    return;
                  }
                  continueToStep3();
                }}
                disabled={loadingUpload || !step2Complete}
                style={[s.btn, s.halfBtn, (loadingUpload || !step2Complete) && s.disabled]}
              >
                {loadingUpload ? (
                  <View style={s.btnLoadingRow}>
                    <ActivityIndicator color="#0B6B76" />
                    <Text style={s.btnT}>Preparando siguiente paso…</Text>
                  </View>
                ) : (
                  <Text style={s.btnT}>
                    {!step2Complete ? 'Completá las fotos' : 'Continuar ▸ Paso 3'}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={s.card}>
            <Text style={s.label}>¿Cómo brindás tu servicio?</Text>

            <Text style={s.helperText}>
              Elegí una o más modalidades según cómo trabajás actualmente.
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Pressable
                onPress={() => toggleServiceMode('HOME')}
                style={[s.chip, serviceModes.includes('HOME') && s.chipActive]}
              >
                <Text style={[s.chipT, serviceModes.includes('HOME') && s.chipTActive]}>
                  A domicilio
                </Text>
              </Pressable>

              <Pressable
                onPress={() => toggleServiceMode('OFFICE')}
                style={[s.chip, serviceModes.includes('OFFICE') && s.chipActive]}
              >
                <Text style={[s.chipT, serviceModes.includes('OFFICE') && s.chipTActive]}>
                  En oficina / local
                </Text>
              </Pressable>

              <Pressable
                onPress={() => toggleServiceMode('ONLINE')}
                style={[s.chip, serviceModes.includes('ONLINE') && s.chipActive]}
              >
                <Text style={[s.chipT, serviceModes.includes('ONLINE') && s.chipTActive]}>
                  Online
                </Text>
              </Pressable>
            </View>

            {serviceModes.includes('OFFICE') && (
              <View style={{ gap: 8, marginTop: 6 }}>
                <Text style={s.subLabel}>Dirección del local</Text>

                <TextInput
                  style={s.input}
                  value={officeAddress}
                  onChangeText={setOfficeAddress}
                  placeholder="Calle y número (ej: San Martín 123)"
                  placeholderTextColor="#cfe"
                />

                <Text style={s.subLabel}>Localidad</Text>

                <Pressable
                  style={s.input}
                  onPress={() => {
                    setOfficeLocalityQuery('');
                    setOfficeLocalityOpen(true);
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {officeLocality || 'Seleccionar localidad'}
                  </Text>
                </Pressable>
              </View>
            )}

            <Text style={[s.label, { marginTop: 10 }]}>Seleccioná los servicios que realizás</Text>

            <Text style={s.helperText}>
              Escribí parte del servicio para encontrarlo más rápido.
            </Text>

            <TextInput
              style={s.input}
              value={serviceQuery}
              onChangeText={setServiceQuery}
              placeholder="Buscar servicio..."
              placeholderTextColor="#cfe"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />

            {selectedCategories.length > 0 && (
              <View style={{ gap: 8 }}>
                <Text style={s.subLabel}>Seleccionados ({selectedCategories.length})</Text>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {selectedCategories.map((c) => (
                    <Pressable
                      key={`selected-${c.slug}`}
                      onPress={() => toggleSlug(c.slug)}
                      style={[s.chip, s.chipActive]}
                    >
                      <Text style={[s.chipT, s.chipTActive]}>{c.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            <View style={{ gap: 8 }}>
              <Text style={s.subLabel}>
                {normalizedQuery ? 'Resultados' : 'Todos los servicios'}
              </Text>

              {filteredCategories.length === 0 ? (
                <Text style={s.emptyText}>No encontramos servicios con ese nombre.</Text>
              ) : (
                <View style={s.servicesScrollBox}>
                  <RNScrollView
                    style={s.servicesInnerScroll}
                    contentContainerStyle={s.servicesInnerContent}
                    showsVerticalScrollIndicator
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                  >
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {filteredCategories.map((c) => {
                        const active = selectedSlugs.includes(c.slug);
                        return (
                          <Pressable
                            key={c.slug}
                            onPress={() => toggleSlug(c.slug)}
                            style={[s.chip, active && s.chipActive]}
                          >
                            <Text style={[s.chipT, active && s.chipTActive]}>{c.name}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </RNScrollView>
                </View>
              )}
            </View>

            {/* ✅ Aviso simple: documentación se sube después desde Home */}
            <View style={s.infoBox}>
              <Text style={s.infoText}>
                Después vas a poder editar tus modalidades, dirección y rubros desde tu Inicio como
                especialista. La documentación (matrícula/título) también se carga después, en cada
                rubro.
              </Text>
            </View>

            {step3Hint ? <Text style={s.hint}>{step3Hint}</Text> : null}

            <View style={s.actionsRow}>
              <Pressable onPress={goToPreviousStep} style={[s.btn, s.btnSecondary, s.halfBtn]}>
                <Text style={s.btnSecondaryT}>◂ Volver</Text>
              </Pressable>

              <Pressable
                onPress={finalize}
                disabled={finalizing}
                style={[s.btn, s.halfBtn, { marginTop: 8 }, finalizing && s.disabled]}
              >
                {finalizing ? (
                  <View style={s.btnLoadingRow}>
                    <ActivityIndicator color="#0B6B76" />
                    <Text style={s.btnT}>Finalizando registro…</Text>
                  </View>
                ) : (
                  <Text style={s.btnT}>Finalizar registro</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAwareScrollView>

      <Modal
        visible={officeLocalityOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setOfficeLocalityOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <View style={s.localityModalCard}>
            <Text style={s.localityModalTitle}>Elegir localidad</Text>

            <TextInput
              value={officeLocalityQuery}
              onChangeText={setOfficeLocalityQuery}
              placeholder="Buscar localidad…"
              placeholderTextColor="#7fa5a9"
              style={s.localitySearchInput}
            />

            <RNScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {filteredOfficeLocalities.map((loc) => (
                <Pressable
                  key={loc}
                  onPress={() => {
                    setOfficeLocality(loc);
                    setOfficeLocalityQuery('');
                    setOfficeLocalityOpen(false);
                  }}
                  style={[s.localityOption, loc === officeLocality && s.localityOptionActive]}
                >
                  <Text style={s.localityOptionText}>{loc}</Text>
                </Pressable>
              ))}
            </RNScrollView>

            <Pressable
              onPress={() => {
                setOfficeLocalityQuery('');
                setOfficeLocalityOpen(false);
              }}
              style={s.localityCloseBtn}
            >
              <Text style={s.localityCloseBtnText}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

/** ✅ Password input con ojito, mantiene mismo look del s.input */
type PasswordRowProps = {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  visible: boolean;
  onToggle: () => void;
  returnKeyType?: 'done' | 'next' | 'send';
  onSubmitEditing?: () => void;

  // ✅ extras (autofill)
  textContentType?: React.ComponentProps<typeof TextInput>['textContentType'];
  autoComplete?: React.ComponentProps<typeof TextInput>['autoComplete'];

  // ✅ hardening
  editable?: boolean;
};

function PasswordInputRow(props: PasswordRowProps) {
  const { visible, onToggle, ...rest } = props;
  return (
    <View style={pwd.wrap}>
      <TextInput
        {...rest}
        style={pwd.input}
        secureTextEntry={!visible}
        placeholderTextColor="#cfe"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Pressable
        onPress={onToggle}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        style={({ pressed }) => [pwd.eyeBtn, pressed && { opacity: 0.75 }]}
      >
        <Text style={pwd.eyeText}>{visible ? '🙈' : '👁️'}</Text>
      </Pressable>
    </View>
  );
}

/** UI: punto de pasos */
function Dot({ active }: { active: boolean }) {
  return <View style={[s.dot, active && s.dotActive]} />;
}

/** UI: mini check */
function MiniCheck({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={s.checkItem}>
      <View style={[s.checkIcon, ok ? s.checkIconOk : s.checkIconNo]}>
        <Text style={[s.checkIconT, ok ? { color: '#0B6B76' } : { color: '#fff' }]}>
          {ok ? '✓' : '·'}
        </Text>
      </View>
      <Text style={s.checkLabel}>{label}</Text>
    </View>
  );
}

/** PickBox KYC mejorado (DNI: cámara/galería, Selfie: cámara directa) */
function PickBoxKyc({
  uri,
  label,
  mode,
  onPickCamera,
  onPickGallery,
  onClear,
}: {
  uri: string | null;
  label: string;
  mode: 'dni' | 'selfie';
  onPickCamera: () => void;
  onPickGallery: () => void;
  onClear?: () => void;
}) {
  if (!uri) {
    return (
      <View style={s.pickCard}>
        <View style={s.pickHeader}>
          <Text style={s.pickTitle}>{label}</Text>
          <View style={[s.badge, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
            <Text style={s.badgeT}>Pendiente</Text>
          </View>
        </View>

        <View style={s.pickButtonsRow}>
          {mode === 'dni' ? (
            <>
              <Pressable onPress={onPickGallery} style={[s.smallBtn, s.smallBtnSoft]}>
                <Text style={s.smallBtnT}>🖼️ Galería</Text>
              </Pressable>
              <Pressable onPress={onPickCamera} style={[s.smallBtn, s.smallBtnSoft]}>
                <Text style={s.smallBtnT}>📷 Cámara</Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={onPickCamera} style={[s.smallBtn, s.smallBtnStrong]}>
              <Text style={[s.smallBtnT, { color: '#0B6B76' }]}>🤳 Sacar selfie</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={s.pickCard}>
      <View style={s.pickHeader}>
        <Text style={s.pickTitle}>{label}</Text>
        <View style={[s.badge, { backgroundColor: 'rgba(255,255,255,0.96)' }]}>
          <Text style={[s.badgeT, { color: '#0B6B76' }]}>✓ Listo</Text>
        </View>
      </View>

      <Image source={{ uri }} style={s.previewBig} />

      <View style={s.previewActionsRow}>
        {mode === 'dni' ? (
          <>
            <Pressable onPress={onPickGallery} style={[s.smallBtn, s.smallBtnSoft]}>
              <Text style={s.smallBtnT}>🖼️ Cambiar</Text>
            </Pressable>
            <Pressable onPress={onPickCamera} style={[s.smallBtn, s.smallBtnSoft]}>
              <Text style={s.smallBtnT}>📷 Otra</Text>
            </Pressable>
          </>
        ) : (
          <Pressable onPress={onPickCamera} style={[s.smallBtn, s.smallBtnSoft]}>
            <Text style={s.smallBtnT}>🤳 Otra selfie</Text>
          </Pressable>
        )}

        {!!onClear && (
          <Pressable onPress={onClear} style={[s.smallBtn, s.smallBtnDanger]}>
            <Text style={s.smallBtnT}>✕</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const pwd = StyleSheet.create({
  wrap: {
    height: 46,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 6,
  },
  input: {
    flex: 1,
    color: '#fff',
    height: '100%',
    paddingRight: 10,
  },
  eyeBtn: {
    height: 36,
    minWidth: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeText: { fontSize: 18, lineHeight: 18 },
});

const s = StyleSheet.create({
  h1: { color: '#fff', fontSize: 28, fontWeight: '800' },
  h2: { color: 'rgba(233,254,255,0.92)' },

  // progreso
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  progressFill: {
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
  progressRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepDots: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.25)' },
  dotActive: { backgroundColor: 'rgba(255,255,255,0.96)' },

  // checks
  checksWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  checkIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkIconOk: { backgroundColor: 'rgba(255,255,255,0.96)' },
  checkIconNo: { backgroundColor: 'rgba(255,255,255,0.18)' },
  checkIconT: { fontWeight: '900' },
  checkLabel: { color: 'rgba(233,254,255,0.92)', fontWeight: '800', fontSize: 12 },

  // hints
  hint: {
    marginTop: 6,
    color: 'rgba(233,254,255,0.92)',
    fontWeight: '900',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },

  passHelp: {
    marginTop: -4,
    color: 'rgba(233,254,255,0.85)',
    fontWeight: '800',
    fontSize: 12,
  },

  inlineHelp: {
    marginTop: -4,
    color: 'rgba(233,254,255,0.92)',
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 17,
  },

  helperText: {
    color: 'rgba(233,254,255,0.85)',
    fontWeight: '700',
    fontSize: 13,
  },
  subLabel: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  emptyText: {
    color: 'rgba(233,254,255,0.85)',
    fontWeight: '700',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  servicesScrollBox: {
    marginTop: 4,
    maxHeight: 260,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  servicesInnerScroll: {
    maxHeight: 260,
  },
  servicesInnerContent: {
    padding: 10,
  },

  localityModalCard: {
    backgroundColor: '#E9FEFF',
    borderRadius: 16,
    padding: 14,
  },
  localityModalTitle: {
    color: '#0B6B76',
    fontWeight: '900',
    fontSize: 16,
    marginBottom: 10,
  },
  localitySearchInput: {
    backgroundColor: 'rgba(11,107,118,0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0B6B76',
    marginBottom: 10,
    fontWeight: '700',
  },
  localityOption: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 6,
  },
  localityOptionActive: {
    backgroundColor: 'rgba(11,107,118,0.10)',
  },
  localityOptionText: {
    color: '#0B6B76',
    fontWeight: '800',
  },
  localityCloseBtn: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#0B6B76',
  },
  localityCloseBtnText: {
    color: '#E9FEFF',
    fontWeight: '900',
  },

  // card base
  card: { backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 16, padding: 14, gap: 10 },
  label: { color: '#fff', fontWeight: '700' },
  input: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    color: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
  },
  btn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  btnT: { color: '#0B6B76', fontWeight: '800' },
  btnLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  btnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  btnSecondaryT: {
    color: '#E9FEFF',
    fontWeight: '800',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  halfBtn: {
    flex: 1,
  },
  disabled: { opacity: 0.5 },
  // chips
  chip: {
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: 'rgba(255,255,255,0.96)' },
  chipT: { color: '#e9feff', fontWeight: '700' },
  chipTActive: { color: '#0B6B76' },

  // badges
  badge: {
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeT: { color: 'rgba(233,254,255,0.92)', fontWeight: '900' },

  // pick cards (kyc)
  pickCard: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  pickHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickTitle: { color: '#fff', fontWeight: '900' },
  pickButtonsRow: { flexDirection: 'row', gap: 10 },
  previewBig: { width: '100%', height: 170, borderRadius: 14 },

  previewActionsRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  smallBtn: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtnSoft: { backgroundColor: 'rgba(255,255,255,0.12)' },
  smallBtnStrong: { backgroundColor: 'rgba(255,255,255,0.96)' },
  smallBtnDanger: { maxWidth: 46, backgroundColor: 'rgba(255,255,255,0.12)' },
  smallBtnT: { color: '#e9feff', fontWeight: '900' },

  // ✅ info box (paso 3)
  infoBox: {
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  infoText: {
    color: 'rgba(233,254,255,0.92)',
    fontWeight: '800',
    lineHeight: 18,
  },
});
