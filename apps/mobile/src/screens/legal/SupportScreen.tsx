// apps/mobile/src/screens/legal/SupportScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const SUPPORT_EMAIL = 'solucitydev@gmail.com';
const SUPPORT_PHONE_INTL = '+5493585717659'; // WhatsApp / Tel en formato internacional

async function openUrl(url: string) {
  try {
    await Linking.openURL(url);
  } catch (e) {
    if (__DEV__) console.log('[Support] openURL failed', url, e);
    Alert.alert('Error', 'No se pudo abrir la acción.');
  }
}

export default function SupportScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const onMail = () => {
    const subject = encodeURIComponent('Soporte Solucity');
    const body = encodeURIComponent('Hola, necesito ayuda con…\n\nMi email:\nMi problema:\n');

    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    const gmailWeb = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
      SUPPORT_EMAIL,
    )}&su=${subject}&body=${body}`;

    // Intento mailto; si el dispositivo no tiene app de correo, fallback a Gmail web
    Linking.openURL(mailto).catch(() => openUrl(gmailWeb));
  };

  const onWhatsApp = () => {
    const phone = SUPPORT_PHONE_INTL.replace(/\D/g, ''); // 549...
    const msg = encodeURIComponent('Hola! Necesito soporte con Solucity.');

    // ✅ Primero intento abrir la app de WhatsApp (mejor en Android)
    const intentUrl = `whatsapp://send?phone=${phone}&text=${msg}`;
    // ✅ Fallback web (si no está WhatsApp instalado)
    const webUrl = `https://wa.me/${phone}?text=${msg}`;

    Linking.openURL(intentUrl).catch(() => openUrl(webUrl));
  };

  const onCall = () => {
    openUrl(`tel:${SUPPORT_PHONE_INTL}`);
  };

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, paddingTop: insets.top + 6 }}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color="#E9FEFF" />
          </Pressable>
          <Text style={styles.title}>Ayuda y soporte</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={{ padding: 16, gap: 12 }}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Contactanos</Text>
            <Text style={styles.muted}>
              Respondemos en menos de <Text style={styles.bold}>24 hs hábiles</Text>.
            </Text>

            <View style={{ height: 12 }} />

            <Pressable onPress={onMail} style={styles.row}>
              <Ionicons name="mail-outline" size={20} color="#E9FEFF" />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Email</Text>
                <Text style={styles.rowValue}>{SUPPORT_EMAIL}</Text>
              </View>
              <Ionicons name="open-outline" size={18} color="#E9FEFF" />
            </Pressable>

            <Pressable onPress={onWhatsApp} style={styles.row}>
              <Ionicons name="logo-whatsapp" size={20} color="#E9FEFF" />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>WhatsApp</Text>
                <Text style={styles.rowValue}>{SUPPORT_PHONE_INTL}</Text>
              </View>
              <Ionicons name="open-outline" size={18} color="#E9FEFF" />
            </Pressable>

            <Pressable onPress={onCall} style={styles.row}>
              <Ionicons name="call-outline" size={20} color="#E9FEFF" />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Llamada</Text>
                <Text style={styles.rowValue}>{SUPPORT_PHONE_INTL}</Text>
              </View>
              <Ionicons name="open-outline" size={18} color="#E9FEFF" />
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Consejo</Text>
            <Text style={styles.muted}>
              Para ayudarte más rápido, incluí: tu email, el rubro, y una captura del error si
              aplica.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 35, 40, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#E9FEFF', fontSize: 20, fontWeight: '800' },

  card: {
    backgroundColor: 'rgba(0, 35, 40, 0.32)',
    borderRadius: 18,
    padding: 16,
  },
  cardTitle: { color: '#E9FEFF', fontSize: 16, fontWeight: '800' },
  muted: { color: '#9ec9cd', marginTop: 6 },
  bold: { color: '#E9FEFF', fontWeight: '800' },

  row: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(233,254,255,0.06)',
  },
  rowTitle: { color: '#E9FEFF', fontWeight: '800' },
  rowValue: { color: 'rgba(233,254,255,0.85)', marginTop: 2 },
});
