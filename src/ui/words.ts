// Les mots de l'appli : un mot simple pour débuter, et son équivalent technique
// (celui qu'on lit sur une vraie table et qu'un sondier emploie).
// Réglage « Les mots » : double (simple + technique), technique seul, simple seul.
// « Mode simple » : l'écran Table n'affiche que l'essentiel.
import { useEffect, useState } from 'react';

export type WordMode = 'double' | 'technique' | 'simple';
export interface Level { simple: boolean; words: WordMode; big: boolean; chosen: boolean }

let level: Level = { simple: false, words: 'double', big: false, chosen: false };
const listeners = new Set<() => void>();

export const getLevel = () => level;
export function setLevel(l: Partial<Level>) {
  level = { ...level, ...l };
  listeners.forEach((f) => f());
}
export function useLevel(): Level {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set((t) => t + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  return level;
}

export interface Term { simple: string; tech: string; help: string; short?: string }

/** Le lexique. `short` = le sigle gardé sur les boutons étroits. */
export const TERMS: Record<string, Term> = {
  main: { simple: 'Le public', tech: 'MAIN L/R · façade', help: 'Ce que le public entend, dans les enceintes de façade.' },
  aux: { simple: 'Retour', tech: 'AUX · bus', help: 'Un mélange à part pour un musicien : ce qui sort dans son enceinte de retour ou son casque.' },
  fx: { simple: 'Effet', tech: 'FX', help: 'Réverbe, écho… Chaque voie y envoie un peu de son ; l’effet revient dans le mélange.', short: 'FX' },
  dca: { simple: 'Groupe', tech: 'DCA', help: 'Monte ou baisse plusieurs voies d’un coup, en gardant leur équilibre.' },
  gain: { simple: 'Force du micro', tech: 'gain', help: 'Le niveau d’entrée de la prise. Il vaut pour tout : public et retours. On le règle une fois, au début.', short: 'Gain' },
  fader: { simple: 'Volume', tech: 'fader', help: 'Le volume de cette voie dans le mélange choisi (le public ou un retour).' },
  gate: { simple: 'Anti-bruit', tech: 'gate', help: 'Coupe le micro quand personne ne joue dedans : moins de bruit de fond.' },
  comp: { simple: 'Adoucir les écarts', tech: 'compresseur', help: 'Rapproche les passages forts et les passages doux : la voix reste devant.', short: 'Comp' },
  phantom: { simple: 'Alimentation du micro', tech: '48 V · phantom', help: 'Du courant envoyé par le câble, pour les micros statiques et certaines boîtes DI. Jamais sur un micro à ruban.', short: '48V' },
  hpf: { simple: 'Couper les graves', tech: 'coupe-bas · HPF', help: 'Enlève les graves inutiles (bruits de pied de micro, souffle) : le son est plus net.' },
  eq: { simple: 'Graves / aigus', tech: 'égaliseur · EQ', help: 'Règle le timbre de la voie : plus ou moins de graves, de médiums, d’aigus.', short: 'EQ' },
  solo: { simple: 'Solo', tech: 'solo · PFL', help: 'Écoute cette voie seule au casque, sans rien changer pour le public.', short: 'SOLO' },
  mute: { simple: 'Couper', tech: 'mute', help: 'Coupe cette voie pour tout le monde. Ses réglages restent.', short: 'MUTE' },
  phase: { simple: 'Son creux ? Essayer l’inverse', tech: 'Ø · phase', help: 'Retourne le signal d’un micro. Utile quand deux micros prennent le même instrument (caisse claire dessus/dessous) et que le son devient maigre : on garde la position qui donne le plus de graves.', short: 'Ø' },
  pan: { simple: 'Gauche / droite', tech: 'panoramique · pan', help: 'Place le son plus à gauche ou plus à droite dans les enceintes.' },
  send: { simple: 'Dose', tech: 'envoi · send', help: 'Combien de cette voie part vers un retour ou un effet.' },
  larsen: { simple: 'Sifflement', tech: 'larsen · feedback', help: 'Le micro reprend le son de l’enceinte, qui le renvoie au micro : ça siffle. On baisse le retour ou on creuse la fréquence.' },
  clip: { simple: 'Trop fort (rouge)', tech: 'saturation · clip', help: 'Le signal dépasse ce que la table accepte : le son grésille. On baisse le gain.' },
  prise: { simple: 'Prise', tech: 'entrée · input', help: 'Où le câble est branché à l’arrière de la table.' },
  voie: { simple: 'Voie', tech: 'canal · channel', help: 'Une tranche de la table : un micro ou un instrument avec tous ses réglages.' },
};

/** Le libellé selon le réglage « Les mots ». `narrow` : bouton étroit → sigle technique. */
export function word(key: string, opts?: { narrow?: boolean; mode?: WordMode }): string {
  const t = TERMS[key];
  if (!t) return key;
  const mode = opts?.mode ?? level.words;
  if (opts?.narrow) return mode === 'simple' ? t.simple : t.short ?? t.tech;
  if (mode === 'technique') return t.short ?? t.tech;
  if (mode === 'simple') return t.simple;
  return `${t.simple} · ${t.short ?? t.tech}`;
}
/** Les deux mots séparés, pour un affichage « grand + petit ». */
export function words2(key: string): { main: string; sub?: string } {
  const t = TERMS[key];
  if (!t) return { main: key };
  if (level.words === 'technique') return { main: t.short ?? t.tech };
  if (level.words === 'simple') return { main: t.simple };
  return { main: t.simple, sub: t.tech };
}
/** La phrase d'aide de l'appui long : mot simple (mot technique) : explication. */
export const explain = (key: string) => { const t = TERMS[key]; return t ? `${t.simple} (${t.tech}) : ${t.help}` : key; };

/** « Retour de Seb · AUX 2 » / « AUX 2 » / « Retour de Seb » */
export function auxLabel(n: number, name: string): string {
  const who = name && !/^(retour|aux|bus) ?\d*$/i.test(name.trim()) ? `Retour de ${name}` : `Retour ${n}`;
  if (level.words === 'technique') return name ? `AUX ${n} · ${name}` : `AUX ${n}`;
  if (level.words === 'simple') return who;
  return `${who} · AUX ${n}`;
}

/** Changer de niveau depuis n'importe quel écran (l'appli enregistre le choix). */
let saver: ((l: Partial<Level>) => void) | null = null;
export const setLevelSaver = (f: ((l: Partial<Level>) => void) | null) => { saver = f; };
export function changeLevel(l: Partial<Level>) { if (saver) saver(l); else setLevel(l); }
