// apps/mobile/src/screens/Onboarding.tsx
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type FlatListProps,
  type ViewToken,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type OnboardingProps = { onFinish: () => void };

type Slide = {
  key: string;
  icon: { lib: 'ion' | 'mci'; name: string };
  h1: string;
  h2?: string;
  body?: string;
  bullets?: string[];
  cta: string;
};

const SLIDES: Slide[] = [
  {
    key: 's1',
    icon: { lib: 'mci', name: 'account-search-outline' },
    h1: 'Encontrá especialistas',
    h2: 'en tu zona.',
    body: 'Electricistas, plomeros, carpinteros y más.',
    bullets: ['Por rubro y cercanía', 'Perfiles y reseñas reales'],
    cta: 'SIGUIENTE',
  },
  {
    key: 's2',
    icon: { lib: 'ion', name: 'chatbubbles-outline' },
    h1: 'Contactá en minutos.',
    body: 'Chateá, acordá precio y horario sin vueltas.',
    bullets: ['Mensajes rápidos', 'Todo en un solo lugar'],
    cta: 'SIGUIENTE',
  },
  {
    key: 's3',
    icon: { lib: 'mci', name: 'shield-check-outline' },
    h1: 'Soluciones seguras.',
    body: 'Especialistas verificados y calificados por clientes.',
    bullets: ['Verificación y antecedentes', 'Soporte ante cualquier problema'],
    cta: 'COMENZAR',
  },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_LENGTH = SCREEN_WIDTH;

export default function Onboarding({ onFinish }: OnboardingProps) {
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);
  const insets = useSafeAreaInsets();

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]?.index != null) setIndex(viewableItems[0].index);
  });

  const viewConfigRef = useRef({ viewAreaCoveragePercentThreshold: 60 });

  const getItemLayout = useCallback<NonNullable<FlatListProps<Slide>['getItemLayout']>>(
    (_: ArrayLike<Slide> | null | undefined, i: number) => ({
      length: ITEM_LENGTH,
      offset: ITEM_LENGTH * i,
      index: i,
    }),
    [],
  );

  const goNext = useCallback(() => {
    if (index < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    } else {
      onFinish();
    }
  }, [index, onFinish]);

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: 6 }]}>
          <View style={styles.progressPill}>
            <Text style={styles.progressText}>
              {index + 1}/{SLIDES.length}
            </Text>
          </View>

          <Pressable onPress={onFinish} style={styles.skipTop} accessibilityRole="button">
            <Text style={styles.skipTopText}>Omitir</Text>
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={SLIDES}
          keyExtractor={(it) => it.key}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged.current}
          viewabilityConfig={viewConfigRef.current}
          getItemLayout={getItemLayout}
          initialNumToRender={1}
          maxToRenderPerBatch={1}
          windowSize={3}
          updateCellsBatchingPeriod={40}
          removeClippedSubviews
          decelerationRate="fast"
          renderItem={({ item }) => (
            <View style={styles.slide}>
              <View style={styles.slideContent}>
                <IconHero icon={item.icon} />

                <View style={styles.textBox}>
                  <Text style={styles.title}>
                    <Text style={styles.titleBold}>{item.h1}</Text>
                    {item.h2 ? `\n${item.h2}` : ''}
                  </Text>

                  {!!item.body && <Text style={styles.body}>{item.body}</Text>}

                  {!!item.bullets?.length && (
                    <View style={styles.bullets}>
                      {item.bullets.slice(0, 3).map((b, i) => (
                        <View key={i} style={styles.bulletRow}>
                          <View style={styles.bulletDot} />
                          <Text style={styles.bulletText}>{b}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </View>
          )}
        />

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: Math.max(14, insets.bottom + 8) }]}>
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>

          <Pressable
            onPress={goNext}
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.92 }]}
            accessibilityRole="button"
          >
            <Text style={styles.ctaText}>{SLIDES[index].cta}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

function IconHero({ icon }: { icon: Slide['icon'] }) {
  const size = 44;

  return (
    <View style={styles.heroWrap}>
      <View style={styles.heroCard}>
        <View style={styles.heroRing}>
          <View style={styles.heroInner}>
            {icon.lib === 'ion' ? (
              <Ionicons name={icon.name as any} size={size} color="#0B6B76" />
            ) : (
              <MaterialCommunityIcons name={icon.name as any} size={size} color="#0B6B76" />
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },

  topBar: {
    paddingHorizontal: 20,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressPill: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
  },
  progressText: { color: '#E9FEFF', fontWeight: '900' },
  skipTop: { paddingHorizontal: 10, paddingVertical: 6 },
  skipTopText: { color: 'rgba(255,255,255,0.92)', fontWeight: '800' },

  slide: { width: SCREEN_WIDTH, flex: 1 },
  slideContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 110, // deja espacio al footer fijo
    alignItems: 'center',
    justifyContent: 'center',
  },

  heroWrap: { width: '100%', alignItems: 'center' },
  heroCard: {
    width: Math.min(SCREEN_WIDTH * 0.78, 320),
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingVertical: 26,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  heroRing: {
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  heroInner: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  textBox: { marginTop: 18, alignItems: 'center', paddingHorizontal: 8 },
  title: { color: '#fff', fontSize: 28, lineHeight: 34, textAlign: 'center', fontWeight: '800' },
  titleBold: { fontWeight: '900' },
  body: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 8,
  },

  bullets: { marginTop: 14, gap: 10, alignSelf: 'stretch' },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 35, 40, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  bulletDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(233,254,255,0.9)',
  },
  bulletText: { color: '#E9FEFF', fontWeight: '800' },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.45)' },
  dotActive: { backgroundColor: '#fff', width: 10, height: 10 },
  cta: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 18,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: '#0B6B76', fontWeight: '900', letterSpacing: 0.5, fontSize: 16 },
});
