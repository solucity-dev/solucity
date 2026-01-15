// apps/mobile/src/screens/Onboarding.tsx
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
  art: 'map' | 'chat' | 'specialist';
  h1: string;
  h2?: string;
  body?: string;
  cta: string;
};

const SLIDES: Slide[] = [
  {
    key: 's1',
    art: 'map',
    h1: 'Encontrá especialistas',
    h2: 'en tu zona.',
    body: 'Electricistas, plomeros, carpinteros y más, al alcance de tu mano.',
    cta: 'SIGUIENTE',
  },
  {
    key: 's2',
    art: 'chat',
    h1: 'Contactá en minutos.',
    body: 'Chateá con especialistas, acordá precio y horario sin vueltas.',
    cta: 'SIGUIENTE',
  },
  {
    key: 's3',
    art: 'specialist',
    h1: 'Soluciones seguras.',
    body: 'Especialistas verificados, calificados por otros clientes.',
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
                <Art kind={item.art} />

                <View style={styles.textBox}>
                  <Text style={styles.title}>
                    <Text style={styles.titleBold}>{item.h1}</Text>
                    {item.h2 ? `\n${item.h2}` : ''}
                  </Text>
                  {!!item.body && <Text style={styles.body}>{item.body}</Text>}
                </View>
              </View>
            </View>
          )}
        />

        {/* Footer con safe area */}
        <View style={[styles.footer, { paddingBottom: Math.max(14, insets.bottom + 8) }]}>
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>

          <Pressable
            onPress={goNext}
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}
            accessibilityRole="button"
          >
            <Text style={styles.ctaText}>{SLIDES[index].cta}</Text>
          </Pressable>

          <Pressable onPress={onFinish} style={styles.skip} accessibilityRole="button">
            <Text style={styles.skipText}>Omitir</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

/** ─────────────────────────────────────────────────────────
 *  ARTS (sin imágenes): mapa + pines, chat, especialista
 *  ───────────────────────────────────────────────────────── */
function Art({ kind }: { kind: Slide['art'] }) {
  return (
    <View style={styles.artWrap}>
      {kind === 'map' && <ArtMap />}
      {kind === 'chat' && <ArtChat />}
      {kind === 'specialist' && <ArtSpecialist />}
    </View>
  );
}

function ArtCard({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.artCardOuter}>
      <View style={styles.artCardInner}>{children}</View>
    </View>
  );
}

/** Slide 1: “mapita con pines” (herramientas) */
function ArtMap() {
  return (
    <ArtCard>
      {/* grid tipo mapa */}
      <View style={styles.mapGrid} />

      {/* calles */}
      <View
        style={[styles.road, { top: 42, left: -10, width: 260, transform: [{ rotate: '12deg' }] }]}
      />
      <View
        style={[
          styles.road,
          { top: 110, left: -20, width: 280, transform: [{ rotate: '-18deg' }] },
        ]}
      />
      <View
        style={[styles.road, { top: 78, left: 10, width: 220, transform: [{ rotate: '0deg' }] }]}
      />

      {/* pines */}
      <Pin x={44} y={44} label="🔧" />
      <Pin x={168} y={62} label="🧰" />
      <Pin x={92} y={122} label="⚡" />
      <Pin x={190} y={128} label="🔩" />

      {/* Badge abajo */}
      <View style={styles.mapBadge}>
        <Text style={styles.mapBadgeText}>Especialistas cerca</Text>
      </View>
    </ArtCard>
  );
}

function Pin({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <View style={[styles.pinWrap, { left: x, top: y }]}>
      <View style={styles.pinDot}>
        <Text style={styles.pinEmoji}>{label}</Text>
      </View>
      <View style={styles.pinStem} />
    </View>
  );
}

/** Slide 2: “Contactá en minutos” (burbujas chat + check) */
function ArtChat() {
  return (
    <ArtCard>
      <View style={styles.chatTopRow}>
        <View style={styles.chatPill}>
          <Text style={styles.chatPillText}>Online</Text>
          <View style={styles.chatGreenDot} />
        </View>
        <View style={styles.chatMiniIcon}>
          <Text style={styles.chatMiniIconText}>💬</Text>
        </View>
      </View>

      <View style={[styles.bubble, styles.bubbleLeft]}>
        <Text style={styles.bubbleText}>Hola! ¿Podés hoy?</Text>
      </View>

      <View style={[styles.bubble, styles.bubbleRight]}>
        <Text style={styles.bubbleText}>Sí ✅ 18:00</Text>
      </View>

      <View style={[styles.bubble, styles.bubbleLeft]}>
        <Text style={styles.bubbleText}>¿Cuánto sale?</Text>
      </View>

      <View style={[styles.bubble, styles.bubbleRight]}>
        <Text style={styles.bubbleText}>$15.000 — confirmado 👍</Text>
      </View>

      <View style={styles.chatFooter}>
        <View style={styles.chatInputFake}>
          <Text style={styles.chatInputFakeText}>Escribí un mensaje…</Text>
        </View>
        <View style={styles.chatSend}>
          <Text style={styles.chatSendText}>➤</Text>
        </View>
      </View>
    </ArtCard>
  );
}

/** Slide 3: “Avatar especialista” (cara simple + escudo verificado) */
function ArtSpecialist() {
  return (
    <ArtCard>
      <View style={styles.avatarWrap}>
        <View style={styles.avatarHead}>
          <View style={styles.avatarHair} />
          <View style={styles.avatarEyesRow}>
            <View style={styles.avatarEye} />
            <View style={styles.avatarEye} />
          </View>
          <View style={styles.avatarMouth} />
        </View>

        <View style={styles.avatarBody}>
          <View style={styles.avatarNeck} />
          <View style={styles.avatarShirt}>
            <View style={styles.avatarBadge}>
              <Text style={styles.avatarBadgeText}>✔</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.specialistCaption}>
        <Text style={styles.specialistCaptionTitle}>Verificado</Text>
        <Text style={styles.specialistCaptionBody}>Identidad + KYC + reseñas</Text>
      </View>
    </ArtCard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },

  slide: { width: SCREEN_WIDTH, flex: 1 },
  slideContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /** Texto */
  textBox: { marginTop: 12, alignItems: 'center', paddingHorizontal: 6 },
  title: { color: '#fff', fontSize: 28, lineHeight: 34, textAlign: 'center', fontWeight: '700' },
  titleBold: { fontWeight: '800' },
  body: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 8,
  },

  /** Footer */
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
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: '#0B6B76', fontWeight: '800', letterSpacing: 0.5, fontSize: 16 },
  skip: { alignSelf: 'center', marginTop: 6 },
  skipText: { color: 'rgba(255,255,255,0.92)' },

  /** ART wrapper + card */
  artWrap: {
    width: Math.min(SCREEN_WIDTH * 0.82, 360),
    aspectRatio: 1.08,
    marginBottom: 16,
  },
  artCardOuter: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
    overflow: 'hidden',
  },
  artCardInner: {
    flex: 1,
    padding: 16,
  },

  /** MAP */
  mapGrid: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  road: {
    position: 'absolute',
    height: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  pinWrap: { position: 'absolute', alignItems: 'center' },
  pinDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.90)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(11,107,118,0.25)',
  },
  pinEmoji: { fontSize: 18 },
  pinStem: {
    width: 6,
    height: 12,
    borderRadius: 6,
    marginTop: -2,
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
  mapBadge: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(1,90,105,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapBadgeText: { color: '#fff', fontWeight: '800', letterSpacing: 0.2 },

  /** CHAT */
  chatTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  chatPillText: { color: '#fff', fontWeight: '800' },
  chatGreenDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(0,255,180,0.9)' },
  chatMiniIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatMiniIconText: { fontSize: 16 },

  bubble: {
    marginTop: 12,
    maxWidth: '84%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  bubbleLeft: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.12)' },
  bubbleRight: { alignSelf: 'flex-end', backgroundColor: 'rgba(255,255,255,0.18)' },
  bubbleText: { color: '#fff', fontWeight: '700' },

  chatFooter: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chatInputFake: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  chatInputFakeText: { color: 'rgba(255,255,255,0.75)', fontWeight: '700' },
  chatSend: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.90)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSendText: { color: '#0B6B76', fontWeight: '900' },

  /** SPECIALIST */
  avatarWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarHead: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 2,
    borderColor: 'rgba(11,107,118,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarHair: {
    position: 'absolute',
    top: 18,
    width: 120,
    height: 56,
    borderTopLeftRadius: 60,
    borderTopRightRadius: 60,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    backgroundColor: 'rgba(1,90,105,0.90)',
  },
  avatarEyesRow: { flexDirection: 'row', gap: 18, marginTop: 18 },
  avatarEye: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'rgba(1,90,105,0.85)' },
  avatarMouth: {
    width: 34,
    height: 8,
    borderRadius: 8,
    marginTop: 14,
    backgroundColor: 'rgba(1,90,105,0.25)',
  },

  avatarBody: { marginTop: -10, alignItems: 'center' },
  avatarNeck: {
    width: 38,
    height: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  avatarShirt: {
    width: 180,
    height: 110,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  avatarBadge: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.90)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBadgeText: { color: '#0B6B76', fontWeight: '900', fontSize: 20 },

  specialistCaption: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(1,90,105,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
  },
  specialistCaptionTitle: { color: '#fff', fontWeight: '900', letterSpacing: 0.2 },
  specialistCaptionBody: { color: 'rgba(255,255,255,0.85)', fontWeight: '700', marginTop: 2 },
});
