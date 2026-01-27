//apps/mobile/src/components/GradiantBackground.tsx
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';

import type { PropsWithChildren } from 'react';

export default function GradientBackground({ children }: PropsWithChildren) {
  return (
    <LinearGradient colors={['#004d5d', '#1498a3']} style={styles.fill}>
      {children}
    </LinearGradient>
  );
}
const styles = StyleSheet.create({ fill: { flex: 1 } });
