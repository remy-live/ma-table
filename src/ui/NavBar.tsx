// Navigation : barre à gauche sur tablette, en bas sur téléphone.
// Cinq sections claires + le bouton « Aide-moi » (assistants).
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { Theme } from './theme';

export type Section = 'table' | 'effets' | 'branchements' | 'scene' | 'reglages';

const ITEMS: [Section, string][] = [
  ['table', 'Table'],
  ['effets', 'Effets'],
  ['branchements', 'Branchements'],
  ['scene', 'Concert'],
  ['reglages', 'Réglages'],
];

function Icon({ id, color, size = 24 }: { id: Section | 'aide' | 'quitter'; color: string; size?: number }) {
  const p = { stroke: color, strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {id === 'table' && (<><Line x1={6} y1={4} x2={6} y2={20} {...p} /><Line x1={12} y1={4} x2={12} y2={20} {...p} /><Line x1={18} y1={4} x2={18} y2={20} {...p} /><Rect x={3.5} y={12} width={5} height={3} rx={1} {...p} fill={color} /><Rect x={9.5} y={7} width={5} height={3} rx={1} {...p} fill={color} /><Rect x={15.5} y={14} width={5} height={3} rx={1} {...p} fill={color} /></>)}
      {id === 'effets' && (<><Path d="M3 17h2l2-6 3 10 3-14 3 8 2-3h3" {...p} /></>)}
      {id === 'branchements' && (<><Circle cx={6} cy={6} r={2.5} {...p} /><Circle cx={18} cy={18} r={2.5} {...p} /><Path d="M6 8.5c0 6 12 3 12 7" {...p} /></>)}
      {id === 'scene' && (<><Path d="M12 3v10" {...p} /><Path d="M8 7a4 4 0 0 0 8 0" {...p} /><Path d="M6 21h12" {...p} /><Path d="M12 13v8" {...p} /></>)}
      {id === 'reglages' && (<><Circle cx={12} cy={12} r={3} {...p} /><Path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" {...p} /></>)}
      {id === 'quitter' && (<><Path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" {...p} /><Path d="M14 8l4 4-4 4" {...p} /><Line x1={18} y1={12} x2={9} y2={12} {...p} /></>)}
      {id === 'aide' && (<><Circle cx={12} cy={12} r={9} {...p} /><Path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7" {...p} /><Circle cx={12} cy={17} r={0.6} {...p} fill={color} /></>)}
    </Svg>
  );
}

export function NavBar(props: { theme: Theme; current: Section; locked: boolean; vertical?: boolean; onGo: (s: Section) => void; onHelp: () => void; onQuit?: () => void }) {
  const { theme, vertical } = props;
  const go = (s: Section) => {
    if (props.locked && s !== 'scene') {
      Alert.alert('Mode Concert', 'L’appli est verrouillée. Déverrouille depuis Concert.');
      return;
    }
    props.onGo(s);
  };
  return (
    <View style={[vertical ? styles.rail : styles.bar, { backgroundColor: theme.deep, borderColor: theme.line }]}>
      <Pressable onPress={props.onHelp} accessibilityLabel="Aide-moi : balance automatique, mode guidé" style={[vertical ? styles.help : styles.helpSmall, { backgroundColor: '#13261E', borderColor: '#1F6F4A' }]}>
        <Icon id="aide" color="#6EE7B7" size={vertical ? 26 : 22} />
        <Text style={{ color: '#A7F3D0', fontSize: vertical ? 11 : 10, fontWeight: '800' }}>Aide-moi</Text>
      </Pressable>
      {ITEMS.map(([id, label]) => {
        const on = props.current === id;
        const dim = props.locked && id !== 'scene';
        const c = on ? theme.accent : dim ? theme.line2 : theme.muted;
        return (
          <Pressable key={id} onPress={() => go(id)} accessibilityRole="tab" accessibilityState={{ selected: on, disabled: dim }} accessibilityLabel={label} style={[vertical ? styles.item : styles.itemSmall, on && { backgroundColor: theme.panel }]}>
            {on && vertical && <View style={[styles.mark, { backgroundColor: theme.accent }]} />}
            <Icon id={id} color={c} size={vertical ? 26 : 22} />
            <Text numberOfLines={1} style={{ color: c, fontSize: vertical ? 11 : 9, fontWeight: on ? '800' : '600' }}>{label}</Text>
          </Pressable>
        );
      })}
      {props.onQuit && vertical && <View style={{ flex: 1 }} />}
      {props.onQuit && (
        <Pressable onPress={() => Alert.alert('Quitter la table ?', 'La table garde son mix. Tu reviens à l’écran d’accueil pour te reconnecter ou changer de table.', [{ text: 'Rester', style: 'cancel' }, { text: 'Quitter', onPress: props.onQuit }])} accessibilityLabel="Quitter : revenir à l’accueil" style={[vertical ? styles.item : styles.itemSmall]}>
          <Icon id="quitter" color={theme.muted} size={vertical ? 24 : 20} />
          <Text numberOfLines={1} style={{ color: theme.muted, fontSize: vertical ? 11 : 9, fontWeight: '600' }}>Quitter</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { width: 96, borderRightWidth: 1, paddingTop: 40, paddingBottom: 16, alignItems: 'center', gap: 6 },
  bar: { flexDirection: 'row', borderTopWidth: 1, paddingBottom: 8, paddingTop: 6, paddingHorizontal: 4, gap: 2 },
  item: { width: 84, height: 70, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 4 },
  itemSmall: { flex: 1, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 2 },
  help: { width: 84, height: 70, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 12 },
  helpSmall: { flex: 1, height: 56, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  mark: { position: 'absolute', left: -6, top: 16, bottom: 16, width: 4, borderRadius: 2 },
});
