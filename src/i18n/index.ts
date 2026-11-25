// Les langues. Les écrans sont écrits en français ; pour une autre langue, chaque texte affiché
// est cherché dans un dictionnaire (français → langue) au moment où il est dessiné.
// Un texte absent du dictionnaire reste en français : rien ne casse, il manque juste une traduction.
import { Text, TextInput } from 'react-native';
import { load, save } from '../store/persist';
import en from './en.json';
import enRules from './en.rules.json';

export type Lang = 'fr' | 'en';
export type LangChoice = Lang | 'auto';
export const LANGS: [LangChoice, string][] = [['auto', 'Automatique'], ['fr', 'Français'], ['en', 'English']];

const DICT: Record<Lang, Map<string, string> | null> = { fr: null, en: new Map(Object.entries(en as Record<string, string>)) };
// phrases avec un morceau qui change (« 3 enregistrements ») : un modèle, et sa traduction avec $1, $2…
const RULES: Record<Lang, [RegExp, string][]> = { fr: [], en: (enRules as [string, string][]).map(([a, b]) => [new RegExp(a), b]) };

let choice: LangChoice = 'auto';
let lang: Lang = 'fr';
const subs = new Set<() => void>();

function deviceLang(): Lang {
  try { return (Intl.DateTimeFormat().resolvedOptions().locale || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en'; } catch { return 'fr'; }
}
const resolve = (c: LangChoice): Lang => (c === 'auto' ? deviceLang() : c);

export const getLang = () => lang;
export const getLangChoice = () => choice;
export const onLang = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export function setLang(c: LangChoice) {
  choice = c; lang = resolve(c);
  save('lang', c).catch(() => {});
  subs.forEach((f) => f());
}
/** À appeler au lancement : relit le choix gardé. */
export async function initLang() {
  const c = await load<LangChoice | null>('lang', null).catch(() => null);
  choice = c ?? 'auto';
  const next = resolve(choice);
  if (next !== lang) { lang = next; subs.forEach((f) => f()); }
}
lang = resolve(choice);

/** Traduit un texte (les espaces du début et de la fin sont gardés). */
export function tr(s: string): string {
  const d = DICT[lang];
  if (!d || !s) return s;
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
  const core = m ? m[2] : s;
  if (!core) return s;
  const hit = d.get(core);
  if (hit != null) return (m ? m[1] : '') + hit + (m ? m[3] : '');
  for (const [re, to] of RULES[lang]) if (re.test(core)) return (m ? m[1] : '') + core.replace(re, to) + (m ? m[3] : '');
  return s;
}

type Props = Record<string, unknown> | null | undefined;
function fix(type: unknown, props: Props): Props {
  if (lang === 'fr' || !props) return props;
  let out = props;
  if (type === Text) {
    const c = props.children;
    if (typeof c === 'string') out = { ...out, children: tr(c) };
    else if (Array.isArray(c) && c.some((x) => typeof x === 'string')) out = { ...out, children: c.map((x) => (typeof x === 'string' ? tr(x) : x)) };
  } else if (type === TextInput && typeof props.placeholder === 'string') out = { ...out, placeholder: tr(props.placeholder) };
  if (typeof props.accessibilityLabel === 'string') out = { ...out, accessibilityLabel: tr(props.accessibilityLabel as string) };
  return out;
}

let installed = false;
/** Branche la traduction sur tout ce qui se dessine. À appeler une fois, avant le premier écran. */
export function installI18n() {
  if (installed) return;
  installed = true;
  const wrap = (mod: Record<string, unknown>) => {
    for (const k of ['jsx', 'jsxs', 'jsxDEV']) {
      const orig = mod[k] as ((type: unknown, props: Props, ...rest: unknown[]) => unknown) | undefined;
      if (typeof orig === 'function') mod[k] = (type: unknown, props: Props, ...rest: unknown[]) => orig(type, fix(type, props), ...rest);
    }
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  try { wrap(require('react/jsx-runtime')); } catch { /* rien */ }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  try { wrap(require('react/jsx-dev-runtime')); } catch { /* rien */ }
}
