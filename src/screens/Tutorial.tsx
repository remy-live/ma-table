// Les gestes en 30 secondes : 4 écrans animés, montrés une fois au premier
// lancement (et toujours disponibles dans Aide-moi).
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Theme } from '../ui/theme';

const STEPS = [
  { title: 'Glisser pour régler', text: 'Les faders et les boutons ronds se règlent en glissant le doigt. Double-tap sur un fader = retour à 0 dB.' },
  { title: 'Rester appuyé = aide', text: 'Pas sûr d’un bouton ? Reste appuyé dessus : une bulle explique à quoi il sert.' },
  { title: 'Qui écoute ?', text: 'Les pastilles en haut choisissent ce que règlent les faders : le public, ou le retour d’un musicien.' },
  { title: 'Les bulles', text: 'Une bulle = un son dans une oreille. Glisse vers la droite pour monter, vers la gauche pour baisser.' },
];

function useLoop(ms: number) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      Animated.timing(v, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
    ]));
    a.start();
    return () => a.stop();
  }, [v, ms]);
  return v;
}

function Finger({ style }: { style: object }) {
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.35)', borderWidth: 3, borderColor: '#FFFFFF' }, style]} />;
}

function Demo({ step, theme }: { step: number; theme: Theme }) {
  const t = useLoop(1100);
  if (step === 0) {
    const y = t.interpolate({ inputRange: [0, 1], outputRange: [120, 20] });
    return (
      <View style={styles.stage}>
        <View style={{ width: 8, height: 150, borderRadius: 4, backgroundColor: theme.track }} />
        <Animated.View style={{ position: 'absolute', top: y, width: 50, height: 26, borderRadius: 6, backgroundColor: theme.cap }} />
        <Finger style={{ top: Animated.add(y, -4), marginLeft: 40 }} />
      </View>
    );
  }
  if (step === 1) {
    const sc = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 1.25, 1.25] });
    const op = t.interpolate({ inputRange: [0, 0.55, 0.7, 1], outputRange: [0, 0, 1, 1] });
    return (
      <View style={styles.stage}>
        <View style={{ height: 44, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: theme.line2, justifyContent: 'center' }}><Text style={{ color: theme.text, fontWeight: '800' }}>SOLO</Text></View>
        <Finger style={{ transform: [{ scale: sc }] }} />
        <Animated.View style={{ position: 'absolute', top: 6, opacity: op, backgroundColor: theme.text, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ color: theme.bg, fontWeight: '800', fontSize: 12 }}>ⓘ écoute cette voie seule au casque</Text>
        </Animated.View>
      </View>
    );
  }
  if (step === 2) {
    const x = t.interpolate({ inputRange: [0, 1], outputRange: [-70, 70] });
    return (
      <View style={styles.stage}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {['#E8EAED', '#60A5FA', '#34D399', '#38BDF8'].map((c, k) => <View key={k} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c }} />)}
        </View>
        <Finger style={{ transform: [{ translateX: x }], top: 70 }} />
      </View>
    );
  }
  const x = t.interpolate({ inputRange: [0, 1], outputRange: [-50, 60] });
  const sz = t.interpolate({ inputRange: [0, 1], outputRange: [18, 70] });
  return (
    <View style={styles.stage}>
      <Animated.View style={{ width: sz, height: sz, borderRadius: 40, backgroundColor: '#F59E0B' }} />
      <Finger style={{ transform: [{ translateX: x }], top: 110 }} />
      <Text style={{ position: 'absolute', bottom: 6, color: theme.muted, fontSize: 12, fontWeight: '800' }}>◀ moins   ·   plus ▶</Text>
    </View>
  );
}

export function Tutorial({ theme, visible, onClose }: { theme: Theme; visible: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  useEffect(() => { if (visible) setStep(0); }, [visible]);
  if (!visible) return null;
  const last = step === STEPS.length - 1;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.back}>
        <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.accent }]}>
          <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '800' }}>LES GESTES · {step + 1}/{STEPS.length}</Text>
          <Text style={{ color: theme.text, fontSize: 24, fontWeight: '800' }}>{STEPS[step].title}</Text>
          <Demo key={step} step={step} theme={theme} />
          <Text style={{ color: theme.text, fontSize: 16, lineHeight: 22 }}>{STEPS[step].text}</Text>
          <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
            {STEPS.map((_, k) => <View key={k} style={{ width: k === step ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: k === step ? theme.accent : theme.line2 }} />)}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={onClose} style={[styles.btn, { borderWidth: 1, borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontWeight: '800' }}>Passer</Text></Pressable>
            <Pressable onPress={() => (last ? onClose() : setStep(step + 1))} style={[styles.btn, { flex: 2, backgroundColor: theme.accent }]}><Text style={{ color: theme.onAccent, fontWeight: '900', fontSize: 16 }}>{last ? 'C’est parti' : 'Suivant ›'}</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 520, borderWidth: 2, borderRadius: 24, padding: 20, gap: 12 },
  stage: { height: 170, alignItems: 'center', justifyContent: 'center' },
  btn: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
