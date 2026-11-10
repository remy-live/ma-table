// Barre de niveau qui se règle au doigt : on la touche pour placer la valeur,
// on glisse pour l'ajuster. Les boutons + / − à côté restent pour le pas à pas.
import React, { useRef, useState } from 'react';
import { PanResponder, StyleProp, View, ViewStyle } from 'react-native';
import { tick } from './haptics';

export function DragBar(props: {
  frac: number; // 0..1, position affichée
  onFrac: (f: number) => void;
  color: string;
  bg: string;
  barH?: number;
  center?: boolean; // remplissage depuis le milieu (gain d'égaliseur)
  label?: string;
  valueText?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [w, setW] = useState(1);
  const fr = Math.max(0, Math.min(1, props.frac));
  const L = useRef({ fr, w, on: props.onFrac, center: props.center });
  L.current = { fr, w, on: props.onFrac, center: props.center };
  const start = useRef(0);
  const set = (v: number) => {
    let n = Math.max(0, Math.min(1, v));
    if (L.current.center && Math.abs(n - 0.5) < 0.025) { if (Math.abs(L.current.fr - 0.5) >= 0.025) tick(); n = 0.5; } // cran au milieu
    L.current.on(n);
  };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e) => {
        const x = e.nativeEvent.locationX / L.current.w;
        // doigt posé près du bout de la barre : pas de saut, on part de la valeur actuelle
        if (Math.abs(x - L.current.fr) * L.current.w < 18) { start.current = L.current.fr; return; }
        start.current = x;
        set(x);
      },
      onPanResponderMove: (_e, g) => set(start.current + g.dx / L.current.w),
    }),
  ).current;
  const h = props.barH ?? 12;
  const left = props.center ? Math.min(fr, 0.5) : 0;
  const width = props.center ? Math.abs(fr - 0.5) : fr;
  return (
    <View
      {...pan.panHandlers}
      onLayout={(e) => setW(Math.max(1, e.nativeEvent.layout.width))}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={props.label}
      accessibilityValue={props.valueText ? { text: props.valueText } : undefined}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => set(fr + (e.nativeEvent.actionName === 'increment' ? 0.04 : -0.04))}
      style={[{ flex: 1, height: 40, justifyContent: 'center' }, props.style]}
    >
      <View pointerEvents="none" style={{ height: h, borderRadius: h / 2, backgroundColor: props.bg, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: `${left * 100}%`, width: `${width * 100}%`, backgroundColor: props.color }} />
        {props.center && <View style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 2, marginLeft: -1, backgroundColor: 'rgba(255,255,255,0.35)' }} />}
      </View>
      {/* la pastille montre qu'on peut l'attraper */}
      <View pointerEvents="none" style={{ position: 'absolute', left: fr * w - 9, width: 18, height: 18 + h / 2, borderRadius: 9, backgroundColor: '#E8EAED', borderWidth: 3, borderColor: props.color }} />
    </View>
  );
}
