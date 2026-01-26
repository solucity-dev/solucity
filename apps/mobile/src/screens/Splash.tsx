//apps/mobile/src/screens/Splash.tsx
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Image, StyleSheet } from 'react-native';

import Logo from '../assets/logo.png';

type Props = { duration?: number };

export default function Splash(_props: Props) {
  return (
    <LinearGradient colors={['#004d5d', '#1498a3']} style={styles.container}>
      <Image source={Logo} resizeMode="contain" style={styles.logo} />
      <ActivityIndicator size="large" color="#ffffff" style={styles.spinner} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // hacé el logo más grande y con leve halo para contraste
  logo: {
    width: 180,
    height: 180,
    marginBottom: 16,
    // “halo” sutil (iOS)
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    // “elevation” Android
    elevation: 6,
  },
  spinner: { marginTop: 8 },
});
