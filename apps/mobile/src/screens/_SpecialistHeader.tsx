//apps/mobile/src/screens
import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SpecialistHeader() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <View style={styles.brandRow}>
        <Image source={require('../assets/logo.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.brandText}>solucity</Text>
      </View>
      <View style={[styles.bellWrap, { top: insets.top + 12 }]}>
        <Ionicons name="notifications-outline" size={26} color="#E9FEFF" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 30, height: 30 },
  brandText: { color: '#E9FEFF', fontWeight: '900', fontSize: 26, letterSpacing: 0.5 },
  bellWrap: { position: 'absolute', right: 18 },
});
