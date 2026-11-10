// Bouton « reste appuyé » : la jauge se remplit pendant l'appui, l'action part
// quand elle est pleine. Sert au verrou du mode Concert (pas de fausse manip).
import React, { useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';
import { tick } from './haptics';

export function HoldButton(props: {
  label: string;
  sub?: string;
  holdingLabel?: string;
  ms?: number;
  color: string;
  bg: string;
  fg: string;
  subFg?: string;
  onHold: () => void;
  style?: StyleProp<ViewStyle>;
  a11y?: string;
}) {
  const ms = props.ms ?? 1000;
  const p = useRef(new Animated.Value(0)).current;
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const [holding, setHolding] = useState(false);
  const start = () => {
    setHolding(true);
    p.setValue(0);
    anim.current = Animated.timing(p, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: false });
    anim.current.start(({ finished }) => {
      setHolding(false);
      p.setValue(0);
      if (finished) { tick(); props.onHold(); }
    });
  };
  const stop = () => { anim.current?.stop(); };
  const w = p.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <Pressable onPressIn={start} onPressOut={stop} accessibilityRole="button" accessibilityLabel={props.a11y ?? props.label} accessibilityHint="reste appuyé"
      style={[{ borderWidth: 2, borderColor: props.color, backgroundColor: props.bg, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, minHeight: 48 }, props.style]}>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: w, backgroundColor: props.color, opacity: 0.45 }} />
      <View pointerEvents="none" style={{ alignItems: 'center' }}>
        <Text numberOfLines={1} style={{ color: props.fg, fontWeight: '900', fontSize: 14 }}>{holding && props.holdingLabel ? props.holdingLabel : props.label}</Text>
        {!!props.sub && <Text numberOfLines={1} style={{ color: props.subFg ?? props.fg, fontSize: 10 }}>{props.sub}</Text>}
      </View>
    </Pressable>
  );
}
