import * as Location from 'expo-location'
import { useEffect } from 'react'
import { api, getAuthToken } from '../lib/api'

export function useSyncCustomerLocationOnMount() {
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const token = getAuthToken()
      if (!token) {
        if (__DEV__) console.log('[useSyncCustomerLocationOnMount] skip: no token yet')
        return
      }

      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') return

        const loc = await Location.getCurrentPositionAsync({})
        if (cancelled) return

        await api.patch('/customers/me/location', {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
        })
      } catch (e: any) {
        const st = e?.response?.status
        console.log('[useSyncCustomerLocationOnMount] error', st, e?.message)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [])
}


