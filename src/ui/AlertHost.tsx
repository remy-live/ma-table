// Toutes les confirmations de l'appli passent par notre propre fenêtre (mêmes couleurs, gros boutons),
// pas par celle d'Android : Alert.alert est remplacé partout.
import React, { useEffect, useState } from 'react';
import { Alert, AlertButton, Modal, Pressable, Text, View } from 'react-native';
import { Theme } from './theme';

type Box = { title: string; msg?: string; buttons: AlertButton[] };
let push: ((b: Box | null) => void) | null = null;

const native = Alert.alert.bind(Alert);
(Alert as unknown as { alert: (t: string, m?: string, b?: AlertButton[]) => void }).alert = (title, msg, buttons) => {
  // si la fenêtre maison n'est pas montée (tout début du lancement), on garde celle du système
  if (push) push({ title, msg, buttons: buttons?.length ? buttons : [{ text: 'OK' }] });
  else native(title, msg, buttons);
};

export function AlertHost({ theme }: { theme: Theme }) {
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => { push = setBox; return () => { push = null; }; }, []);
  if (!box) return null;
  const close = (b?: AlertButton) => { setBox(null); b?.onPress?.(); };
  const cancel = box.buttons.find((b) => b.style === 'cancel');
  const win = (
    <Pressable onPress={() => close(cancel)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <Pressable onPress={() => {}} style={{ width: 420, maxWidth: '92%', backgroundColor: theme.panel, borderColor: theme.line2, borderWidth: 1, borderRadius: 18, padding: 18, gap: 10 }}>
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: '900' }}>{box.title}</Text>
        {!!box.msg && <Text style={{ color: theme.muted, fontSize: 14, lineHeight: 20 }}>{box.msg}</Text>}
        <View style={{ gap: 6, marginTop: 4 }}>
          {box.buttons.map((b, k) => (
            <Pressable key={k} onPress={() => close(b)} style={{ minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: b.style === 'cancel' ? 'transparent' : b.style === 'destructive' ? '#3A1414' : theme.deep, borderWidth: 1, borderColor: b.style === 'destructive' ? '#7F1D1D' : theme.line2 }} accessibilityRole="button">
              <Text style={{ color: b.style === 'destructive' ? '#FCA5A5' : b.style === 'cancel' ? theme.muted : theme.text, fontWeight: '800', fontSize: 15 }}>{b.text}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Pressable>
  );
  // une vraie fenêtre, qui passe au-dessus des écrans déjà ouverts
  return <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => close(cancel)}>{win}</Modal>;
}
