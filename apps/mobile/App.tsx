import { Text, View } from 'react-native'

export default function App() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>API_URL: {process.env.EXPO_PUBLIC_API_URL}</Text>
    </View>
  )
}
