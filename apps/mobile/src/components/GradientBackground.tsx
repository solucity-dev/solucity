import { LinearGradient } from 'expo-linear-gradient'
import type { PropsWithChildren } from 'react'
import { StyleSheet } from 'react-native'

export default function GradientBackground({ children }: PropsWithChildren) {
  return (
    <LinearGradient colors={['#004d5d', '#1498a3']} style={styles.fill}>
      {children}
    </LinearGradient>
  )
}
const styles = StyleSheet.create({ fill: { flex: 1 } })
