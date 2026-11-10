// Aide « en restant appuyé » : un appui long sur un bouton affiche en haut de
// l'écran une bulle qui dit à quoi il sert. Elle s'efface seule.
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Theme } from './theme';

let listener: ((t: string | null) => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export function showTip(text: string) {
  listener?.(text);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => listener?.(null), Math.min(9000, 2500 + text.length * 45));
}

/** Les textes d'aide des commandes principales. */
export const HELP = {
  mono: '1 enceinte / 2 enceintes : envoie tout pareil à gauche et à droite si tu n’as qu’une enceinte, ou rétablit la stéréo.',
  copyMix: 'Copier un mix : donne à une ou plusieurs personnes ce qu’entend une autre (ex. tout le public dans le retour du bassiste), puis ajuste.',
  view: 'Vue : change la présentation des tranches — complète, compacte, gains (un bouton par entrée) ou la table dessinée.',
  undo: 'Annuler : revient sur ton dernier geste.',
  organize: 'Organiser : déplace les tranches, échange deux voies, copie des réglages en glissant « Copier » sur une autre voie, renomme.',
  groups: 'Groupes : rassemble des voies (ex. toute la batterie) pour les monter ou baisser ensemble.',
  mix: 'Les faders règlent ce qu’entend la personne choisie : le public (façade) ou un retour. Touche une pastille pour changer.',
  fxChip: 'FX : règle combien chaque voie envoie dans un effet (réverbe, écho…).',
  mute: 'MUTE : coupe cette voie pour tout le monde.',
  solo: 'SOLO : écoute cette voie seule au casque, sans rien changer pour le public. Le bandeau jaune permet de tout arrêter.',
  eq: 'EQ : l’égaliseur de la voie (graves, médiums, aigus).',
  fx: 'Les 4 points : combien cette voie envoie dans chacun des 4 effets. Touche pour régler.',
  gain: 'Gain : le niveau d’entrée du micro. Monte jusqu’à ce que le vumètre soit vert franc quand ça joue fort, sans rouge.',
  name: 'Le nom de la voie : touche pour le changer et choisir sa couleur.',
  plug: 'La prise : où est branché ce son à l’arrière de la table. Touche pour tout régler (gain, 48 V, sorties…).',
  table: 'Table : les faders, le cœur de l’appli.',
  effets: 'Effets : les 4 effets de la table (réverbe, écho, chorus…) et qui les utilise.',
  branchements: 'Branchements : qui entend quoi, en câbles ou en bulles.',
  concert: 'Concert : ta soirée (enregistrer, revenir), le bouton de secours et le verrouillage pendant le concert.',
  reglages: 'Réglages : l’apparence, le confort et la connexion à la table.',
  aide: 'Aide-moi : mode guidé, balance automatique et check-list avant le concert.',
  quitter: 'Quitter : te déconnecter de la table et revenir à l’accueil.',
};

export function TipHost({ theme }: { theme: Theme }) {
  const [t, setT] = useState<string | null>(null);
  useEffect(() => { listener = setT; return () => { listener = null; }; }, []);
  if (!t) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center', zIndex: 1000, elevation: 30 }}>
      <Pressable onPress={() => setT(null)} style={{ maxWidth: 560, marginHorizontal: 16, flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: theme.text, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12, elevation: 30 }}>
        <Text style={{ color: theme.bg, fontSize: 18, fontWeight: '900' }}>ⓘ</Text>
        <Text style={{ flex: 1, color: theme.bg, fontSize: 15, fontWeight: '700', lineHeight: 21 }}>{t}</Text>
      </Pressable>
    </View>
  );
}
