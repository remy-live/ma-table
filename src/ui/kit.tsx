// Le kit de l'appli : les mêmes briques sur tous les écrans, pour que tout
// se ressemble. En-tête de section, onglets, carte, sur-titre, bouton.
import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Theme } from './theme';

/** Espacements et rayons : une seule échelle pour toute l'appli. */
export const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const RAD = { sm: 10, md: 14, lg: 18, pill: 999 };
/** Marge haute commune (barre d'état). */
export const TOP = 40;

/** Couleurs de sens, identiques dans tous les designs. */
export const SEM = {
  danger: '#EF4444', dangerSoft: '#FCA5A5', dangerLine: '#7F1D1D', dangerBg: '#2A1414',
  warn: '#F59E0B', warnSoft: '#FCD34D',
  ok: '#34D399', okSoft: '#A7F3D0', okLine: '#1F6F4A', okBg: '#13261E',
  ink: '#0B0D10',
};

/** En-tête d'une section : titre, phrase d'aide, actions à droite. Toujours la même hauteur. */
export function ScreenHeader(props: { theme: Theme; title: string; sub?: string; children?: React.ReactNode; style?: ViewStyle }) {
  const { theme } = props;
  return (
    <View style={[styles.header, props.style]}>
      <View style={{ flex: 1, minWidth: 160 }}>
        <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>{props.title}</Text>
        {!!props.sub && <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 12 }}>{props.sub}</Text>}
      </View>
      {props.children}
    </View>
  );
}

/** Onglets : un seul choix parmi quelques-uns. */
export function Segmented<T extends string>(props: { theme: Theme; value: T; options: readonly (readonly [T, string, string?])[]; onChange: (v: T) => void; fill?: boolean; style?: ViewStyle }) {
  const { theme } = props;
  return (
    <View style={[styles.seg, { borderColor: theme.line2, backgroundColor: theme.deep }, props.fill && { alignSelf: 'stretch' }, props.style]}>
      {props.options.map(([id, label, sub]) => {
        const on = props.value === id;
        return (
          <Pressable key={id} onPress={() => props.onChange(id)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[styles.segBtn, props.fill && { flex: 1 }, on && { backgroundColor: theme.accent }]}>
            <Text numberOfLines={1} style={{ color: on ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 13 }}>{label}</Text>
            {!!sub && <Text numberOfLines={1} style={{ color: on ? theme.onAccent : theme.muted, fontSize: 10 }}>{sub}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Carte : un bloc de contenu. `tone` colore le bord. */
export function Card(props: { theme: Theme; children: React.ReactNode; color?: string; strong?: boolean; style?: ViewStyle | ViewStyle[] }) {
  const { theme } = props;
  return <View style={[styles.card, { backgroundColor: theme.panel, borderColor: props.color ?? theme.line, borderWidth: props.strong || props.color ? 2 : 1 }, props.style as ViewStyle]}>{props.children}</View>;
}

/** Petit sur-titre en capitales. */
export function Kicker({ theme, children, color }: { theme: Theme; children: React.ReactNode; color?: string }) {
  return <Text style={{ color: color ?? theme.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 }}>{children}</Text>;
}

type Kind = 'primary' | 'outline' | 'ghost' | 'danger';
/** Bouton. primary = l'action de l'écran (une seule), outline = le reste. */
export function Btn(props: { theme: Theme; label: string; onPress: () => void; kind?: Kind; icon?: string; disabled?: boolean; small?: boolean; color?: string; style?: ViewStyle; a11y?: string }) {
  const { theme } = props;
  const kind = props.kind ?? 'outline';
  const c = props.color ?? theme.accent;
  const bg = kind === 'primary' ? c : kind === 'danger' ? SEM.dangerBg : 'transparent';
  const border = kind === 'primary' ? c : kind === 'danger' ? SEM.dangerLine : kind === 'ghost' ? 'transparent' : theme.line2;
  const ink = kind === 'primary' ? (props.color ? SEM.ink : theme.onAccent) : kind === 'danger' ? SEM.dangerSoft : theme.text;
  return (
    <Pressable onPress={props.disabled ? undefined : props.onPress} accessibilityRole="button" accessibilityLabel={props.a11y ?? props.label} accessibilityState={{ disabled: !!props.disabled }} style={[styles.btn, props.small && styles.btnSmall, { backgroundColor: bg, borderColor: border, opacity: props.disabled ? 0.4 : 1 }, props.style]}>
      {!!props.icon && <Text style={{ color: ink, fontSize: props.small ? 14 : 16, fontWeight: '800' }}>{props.icon}</Text>}
      <Text numberOfLines={1} style={{ color: ink, fontWeight: '800', fontSize: props.small ? 12 : 14 }}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: SP.md, paddingTop: TOP, paddingHorizontal: SP.lg, paddingBottom: SP.sm, flexWrap: 'wrap' },
  title: { fontSize: 24, fontWeight: '800' },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: RAD.md, padding: 3, gap: 3 },
  segBtn: { minHeight: 42, paddingHorizontal: 14, borderRadius: RAD.md - 3, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: RAD.lg, padding: SP.md + 2, gap: SP.sm },
  btn: { minHeight: 48, paddingHorizontal: SP.lg, borderRadius: RAD.md, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP.sm },
  btnSmall: { minHeight: 40, paddingHorizontal: SP.md, borderRadius: RAD.sm + 2 },
});

/** Croix de fermeture bien visible : un rond contrasté de 44 px. */
export function CloseX({ theme, onPress, label = 'Fermer', size = 44 }: { theme: Theme; onPress: () => void; label?: string; size?: number }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}
      style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: theme.text, backgroundColor: theme.deep, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: theme.text, fontSize: size * 0.42, fontWeight: '900', lineHeight: size * 0.5 }}>✕</Text>
    </Pressable>
  );
}
