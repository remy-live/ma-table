// Navigation : barre à gauche sur tablette, en bas sur téléphone.
// Cinq sections claires + le bouton « Aide-moi » (assistants).
import { useRec } from '../screens/RecorderSheet';
import React from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { HELP, showTip } from './tip';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { Theme } from './theme';
import { LinkBadge } from './LinkBadge';
import { KillButton } from './KillSwitch';
import { getLevel } from './words';
import { XAirClient } from '../xair/XAirClient';

export type Section = 'table' | 'effets' | 'branchements' | 'scene' | 'reglages';

const ITEMS: [Section, string][] = [
  ['table', 'Table'],
  ['effets', 'Effets'],
  ['branchements', 'Branchements'],
  ['scene', 'Concert'],
  ['reglages', 'Réglages'],
];

export function Icon({ id, color, size = 24 }: { id: Section | 'aide' | 'quitter' | 'mixages' | 'rec' | 'play' | 'casque' | 'partager'; color: string; size?: number }) {
  const p = { stroke: color, strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {id === 'play' && (<><Circle cx={12} cy={12} r={9} {...p} /><Path d="M10 8.5l6 3.5-6 3.5z" {...p} fill={color} /></>)}
      {id === 'casque' && (<><Path d="M4 14v-2a8 8 0 0 1 16 0v2" {...p} /><Rect x={3} y={14} width={4} height={6} rx={1.5} {...p} /><Rect x={17} y={14} width={4} height={6} rx={1.5} {...p} /></>)}
      {id === 'partager' && (<><Circle cx={6} cy={12} r={2.5} {...p} /><Circle cx={18} cy={6} r={2.5} {...p} /><Circle cx={18} cy={18} r={2.5} {...p} /><Path d="M8.2 10.9l7.6-3.8M8.2 13.1l7.6 3.8" {...p} /></>)}
      {id === 'rec' && (<><Circle cx={12} cy={12} r={9} {...p} /><Circle cx={12} cy={12} r={4.5} {...p} fill={color} /></>)}
      {id === 'mixages' && (<><Rect x={4} y={4} width={16} height={16} rx={3} {...p} /><Line x1={8} y1={9} x2={16} y2={9} {...p} /><Line x1={8} y1={13} x2={16} y2={13} {...p} /><Line x1={8} y1={17} x2={12} y2={17} {...p} /></>)}
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

/** « Plus » (téléphone) : ce qui ne tient pas dans les quatre onglets. */
export function MoreSheet(props: { theme: Theme; visible: boolean; current: Section; onGo: (s: Section) => void; onRec?: () => void; onMixes: () => void; onQuit: () => void; onClose: () => void }) {
  const { theme } = props;
  const rows: [Section | 'mixages' | 'quitter' | 'rec', string, string][] = [
    ...(props.onRec ? [['rec', 'Enregistrer', 'Enregistrer la répétition ou le concert · mes enregistrements'] as ['rec', string, string]] : []),
    ['effets', 'Effets', 'Réverbe, écho… et qui les utilise'],
    ['branchements', 'Branchements', 'Qui entend quoi : câbles, bulles, scène'],
    ['mixages', 'Mes mixages', 'Nouveau mixage, modèles, reprendre un ancien'],
    ['reglages', 'Réglages', 'Mode simple, les mots, l’apparence, la connexion'],
    ['quitter', 'Quitter la table', 'Revenir à l’accueil (la table garde son mix)'],
  ];
  const press = (id: Section | 'mixages' | 'quitter' | 'rec') => {
    props.onClose();
    if (id === 'rec') { props.onRec?.(); return; }
    if (id === 'mixages') props.onMixes();
    else if (id === 'quitter') Alert.alert('Quitter la table ?', 'La table garde son mix. Tu reviens à l’écran d’accueil.', [{ text: 'Rester', style: 'cancel' }, { text: 'Quitter', onPress: props.onQuit }]);
    else props.onGo(id);
  };
  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }} onPress={props.onClose}>
        <Pressable onPress={() => {}} style={{ backgroundColor: theme.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: theme.line, padding: 14, paddingBottom: 22, gap: 8 }}>
          <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800', paddingHorizontal: 4 }}>Plus</Text>
          {rows.map(([id, label, sub]) => {
            const on = props.current === id;
            return (
              <Pressable key={id} onPress={() => press(id)} accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 62, borderRadius: 14, borderWidth: 1, borderColor: on ? theme.accent : theme.line, backgroundColor: theme.deep, paddingHorizontal: 14 }}>
                <Icon id={id} color={on ? theme.accent : id === 'quitter' ? '#F87171' : theme.text} size={26} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: id === 'quitter' ? '#F87171' : theme.text, fontSize: 17, fontWeight: '800' }}>{label}</Text>
                  <Text style={{ color: theme.muted, fontSize: 13 }}>{sub}</Text>
                </View>
                <Text style={{ color: theme.muted, fontSize: 20 }}>›</Text>
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function NavBar(props: { theme: Theme; current: Section; locked: boolean; vertical?: boolean; onGo: (s: Section) => void; onHelp: () => void; onQuit?: () => void; client?: XAirClient; onMixes?: () => void; onMore?: () => void; onRec?: () => void }) {
  const { theme, vertical } = props;
  const rec = useRec();
  // écran peu haut (tablette couchée) : les boutons du côté se serrent pour tous tenir
  const tight = useWindowDimensions().height < 820;
  const go = (s: Section) => {
    if (props.locked && s !== 'scene') {
      Alert.alert('Mode Concert', 'L’appli est verrouillée. Déverrouille depuis Concert.');
      return;
    }
    props.onGo(s);
  };
  // Téléphone : quatre grands onglets, le reste est rangé dans « Plus »
  if (!vertical) {
    const big = getLevel().big;
    const inMore = props.current !== 'table' && props.current !== 'scene';
    const tab = (key: string, icon: React.ReactNode, label: string, on: boolean, onPress: () => void, tip: string, special?: boolean) => (
      <Pressable key={key} onPress={onPress} onLongPress={() => showTip(tip)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label}
        style={[styles.tab4, special ? { backgroundColor: '#13261E', borderColor: '#1F6F4A', borderWidth: 1 } : on && { backgroundColor: theme.panel }]}>
        {icon}
        <Text style={{ color: special ? '#A7F3D0' : on ? theme.accent : theme.muted, fontSize: big ? 14 : 12, fontWeight: '800' }}>{label}</Text>
      </Pressable>
    );
    const col = (on: boolean, dim?: boolean) => (on ? theme.accent : dim ? theme.line2 : theme.muted);
    return (
      <View style={[styles.bar, { backgroundColor: theme.deep, borderColor: theme.line }]}>
        {tab('table', <Icon id="table" color={col(props.current === 'table', props.locked)} size={24} />, 'Table', props.current === 'table', () => go('table'), HELP.table)}
        {tab('scene', <Icon id="scene" color={col(props.current === 'scene')} size={24} />, 'Concert', props.current === 'scene', () => go('scene'), HELP.concert)}
        {tab('aide', <Icon id="aide" color="#6EE7B7" size={24} />, 'Aide', false, props.onHelp, HELP.aide, true)}
        {tab('plus', <Text style={{ color: col(inMore, props.locked), fontSize: 20, fontWeight: '900', lineHeight: 24 }}>•••</Text>, 'Plus', inMore, () => props.onMore?.(), 'Plus : effets, branchements, mixages, réglages, quitter.')}
      </View>
    );
  }
  return (
    <View style={[vertical ? styles.rail : styles.bar, vertical && tight && { paddingTop: 28, gap: 3 }, { backgroundColor: theme.deep, borderColor: theme.line }]}>
      {/* tout en haut, loin de « Quitter » et des onglets */}
      {props.client && <View style={{ marginBottom: 14 }}><KillButton client={props.client} vertical={vertical} /></View>}
      <Pressable onPress={props.onHelp} onLongPress={() => showTip(HELP.aide)} accessibilityLabel="Aide-moi : balance automatique, mode guidé" style={[vertical ? styles.help : styles.helpSmall, { backgroundColor: '#13261E', borderColor: '#1F6F4A' }]}>
        <Icon id="aide" color="#6EE7B7" size={vertical ? 26 : 22} />
        <Text style={{ color: '#A7F3D0', fontSize: vertical ? 11 : 10, fontWeight: '800' }}>Aide-moi</Text>
      </Pressable>
      {ITEMS.map(([id, label]) => {
        const on = props.current === id;
        const dim = props.locked && id !== 'scene';
        const c = on ? theme.accent : dim ? theme.line2 : theme.muted;
        return (
          <React.Fragment key={id}>
          <Pressable onPress={() => go(id)} onLongPress={() => showTip((HELP as Record<string, string>)[id === 'scene' ? 'concert' : id] ?? label)} accessibilityRole="tab" accessibilityState={{ selected: on, disabled: dim }} accessibilityLabel={label} style={[vertical ? styles.item : styles.itemSmall, vertical && tight && { height: 58 }, on && { backgroundColor: theme.panel }]}>
            {on && vertical && <View style={[styles.mark, { backgroundColor: theme.accent }]} />}
            <Icon id={id} color={c} size={vertical ? 26 : 22} />
            <Text numberOfLines={1} style={{ color: c, fontSize: vertical ? 11 : 9, fontWeight: on ? '800' : '600' }}>{label}</Text>
          </Pressable>
          {id === 'scene' && props.onRec && vertical && (
            <Pressable onPress={props.onRec} onLongPress={() => showTip('Enregistrer : chaque voie dans son fichier, par le câble USB. Et tous tes enregistrements : écouter, mixer, maquette.')} accessibilityLabel={rec.on ? 'Enregistrement en cours' : 'Enregistrer'} style={[styles.item, tight && { height: 58 }, rec.on && { backgroundColor: '#3A1414' }]}>
              <Icon id="rec" color={rec.on || rec.armed ? '#F87171' : theme.muted} size={26} />
              <Text numberOfLines={1} style={{ color: rec.on || rec.armed ? '#FCA5A5' : theme.muted, fontSize: 11, fontWeight: rec.on ? '800' : '600' }}>{rec.on ? 'En cours' : 'Enregistrer'}</Text>
            </Pressable>
          )}
          </React.Fragment>
        );
      })}
      {props.onMixes && vertical && (
        <Pressable onPress={props.onMixes} onLongPress={() => showTip('Mes mixages : nouveau mixage avec son nom, modèles (artiste solo, groupe…), reprendre un ancien.')} accessibilityLabel="Mes mixages" style={[styles.item, tight && { height: 58 }]}>
          <Icon id="mixages" color={theme.muted} size={26} />
          <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 11, fontWeight: '600' }}>Mixages</Text>
        </Pressable>
      )}
      {props.onQuit && vertical && <View style={{ flex: 1 }} />}
      {props.client && <LinkBadge client={props.client} theme={theme} small={!vertical} />}
      {props.onQuit && (
        <Pressable onPress={() => Alert.alert('Quitter la table ?', 'La table garde son mix. Tu reviens à l’écran d’accueil pour te reconnecter ou changer de table.', [{ text: 'Rester', style: 'cancel' }, { text: 'Quitter', onPress: props.onQuit }])} onLongPress={() => showTip(HELP.quitter)} accessibilityLabel="Quitter : revenir à l’accueil" style={[vertical ? styles.item : styles.itemSmall, vertical && tight && { height: 58 }]}>
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
  tab4: { flex: 1, height: 58, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 2 },
  itemSmall: { flex: 1, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 2 },
  help: { width: 84, height: 70, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 12 },
  helpSmall: { flex: 1, height: 56, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  mark: { position: 'absolute', left: -6, top: 16, bottom: 16, width: 4, borderRadius: 2 },
});
