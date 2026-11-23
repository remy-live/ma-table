// « Gros texte » : les textes de 11 à 15 gagnent 2 points partout
// dans l'appli, sans toucher aux titres. On intercepte le rendu de <Text>.
import { StyleSheet, Text } from 'react-native';
import { getLevel } from './words';

let installed = false;
export function installBigText() {
  if (installed) return;
  installed = true;
  const T = Text as unknown as { render?: (props: Record<string, unknown>, ref: unknown) => unknown };
  const orig = T.render;
  if (typeof orig !== 'function') return; // cette version de React Native ne le permet pas : on ne casse rien
  T.render = function (props, ref) {
    if (!getLevel().big) return orig.call(this, props, ref);
    const flat = StyleSheet.flatten(props.style as never) as { fontSize?: number } | undefined;
    const fs = flat?.fontSize ?? 14;
    // les titres restent tels quels ; les graduations et pastilles minuscules aussi (elles sont calées au pixel)
    if (fs >= 16 || fs < 11) return orig.call(this, props, ref);
    return orig.call(this, { ...props, style: [props.style, { fontSize: Math.max(12, fs + 2) }] }, ref);
  };
}
