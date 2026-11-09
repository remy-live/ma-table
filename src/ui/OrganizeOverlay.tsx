// Mode « Organiser » : par-dessus chaque voie, une poignée pour la glisser
// à une autre place, et les actions Copier vers / Échanger / Entrée / Renommer.
import React, { useRef } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Theme } from './theme';

export function OrganizeOverlay(props: {
  theme: Theme;
  isSource: boolean;
  modeLabel: string;
  onCopy: () => void;
  onSwap: () => void;
  onInput: () => void;
  onRename: () => void;
  onCancel: () => void;
  onDrag: (dx: number) => void;
  onDrop: (dx: number) => void;
  /** glisser le bouton « Copier » sur une autre voie */
  onCopyDrag?: (dx: number | null) => void;
  onCopyDrop?: (dx: number) => void;
}) {
  const { theme } = props;
  const latest = useRef(props);
  latest.current = props;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderMove: (_e, g) => latest.current.onDrag(g.dx),
      onPanResponderRelease: (_e, g) => latest.current.onDrop(g.dx),
      onPanResponderTerminate: () => latest.current.onDrop(0),
    }),
  ).current;

  // « Copier les réglages » : un appui ouvre la fenêtre, un glisser vise une voie
  const copyPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderMove: (_e, g) => { if (Math.abs(g.dx) > 10) latest.current.onCopyDrag?.(g.dx); },
      onPanResponderRelease: (_e, g) => {
        latest.current.onCopyDrag?.(null);
        if (Math.abs(g.dx) > 10 && latest.current.onCopyDrop) latest.current.onCopyDrop(g.dx);
        else latest.current.onCopy();
      },
      onPanResponderTerminate: () => latest.current.onCopyDrag?.(null),
    }),
  ).current;

  if (props.isSource) {
    return (
      <View style={[styles.cover, { borderColor: theme.accent, backgroundColor: 'rgba(245,158,11,0.22)' }]}>
        <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800', textAlign: 'center' }}>Source de la {props.modeLabel}</Text>
        <Text style={{ color: theme.muted, fontSize: 11, textAlign: 'center' }}>touche les autres voies</Text>
        <Pressable onPress={props.onCancel} style={[styles.btn, { borderColor: theme.line2 }]}><Text style={[styles.btnText, { color: theme.text }]}>Annuler</Text></Pressable>
      </View>
    );
  }
  return (
    <View style={[styles.cover, { borderColor: theme.line2, backgroundColor: 'rgba(0,0,0,0.62)' }]}>
      <View {...pan.panHandlers} accessibilityLabel="Glisser pour déplacer la voie" style={[styles.handle, { borderColor: theme.accent }]}>
        <Text style={{ color: theme.accent, fontSize: 22, fontWeight: '800' }}>⇆</Text>
        <Text style={{ color: theme.text, fontSize: 10, fontWeight: '800', textAlign: 'center' }}>glisse pour déplacer</Text>
      </View>
      <View {...copyPan.panHandlers} accessibilityRole="button" accessibilityLabel="Copier les réglages : toucher, ou glisser sur une autre voie" style={[styles.btn, { backgroundColor: theme.accent, borderColor: theme.accent, minHeight: 58 }]}>
        <Text style={[styles.btnText, { color: theme.onAccent, fontSize: 13 }]}>⧉ Copier</Text>
        <Text style={{ color: theme.onAccent, fontSize: 9, fontWeight: '700', textAlign: 'center' }}>touche, ou glisse ⇢</Text>
      </View>
      <Pressable onPress={props.onSwap} style={[styles.btn, { borderColor: theme.line2 }]}><Text style={[styles.btnText, { color: theme.text }]}>Échanger…</Text></Pressable>
      <Pressable onPress={props.onInput} style={[styles.btn, { borderColor: theme.line2 }]}><Text style={[styles.btnText, { color: theme.text }]}>Entrée</Text></Pressable>
      <Pressable onPress={props.onRename} style={[styles.btn, { borderColor: theme.line2 }]}><Text style={[styles.btnText, { color: theme.text }]}>Renommer</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 12, borderWidth: 2, padding: 6, gap: 6, justifyContent: 'center', zIndex: 6 },
  handle: { height: 96, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 2 },
  btn: { minHeight: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  btnText: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
});
