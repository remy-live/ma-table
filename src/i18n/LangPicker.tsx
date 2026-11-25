// Le choix de la langue (Réglages, et « Avancé » à l'accueil).
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Theme } from '../ui/theme';
import { getLangChoice, LANGS, onLang, setLang } from './index';

export function LangPicker({ theme }: { theme: Theme }) {
  const [, setN] = useState(0);
  useEffect(() => onLang(() => setN((n) => n + 1)), []);
  const cur = getLangChoice();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 }}>LANGUE · LANGUAGE</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {LANGS.map(([id, label]) => (
          <Pressable key={id} onPress={() => setLang(id)} accessibilityRole="button" accessibilityState={{ selected: cur === id }} style={{ minHeight: 46, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.5, justifyContent: 'center', borderColor: cur === id ? theme.accent : theme.line2, backgroundColor: cur === id ? theme.accent : 'transparent' }}>
            <Text style={{ color: cur === id ? theme.onAccent : theme.text, fontSize: 14, fontWeight: '800' }}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
