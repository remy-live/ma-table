// Designs de l'appli. Tout l'écran lit ses couleurs ici ; `look` change aussi
// le dessin des boutons rotatifs et des capuchons de fader.

export type Look = 'flat' | 'real' | 'vintage' | 'led' | 'neon' | 'minimal';

export interface Theme {
  id: string;
  name: string;
  desc: string;
  look: Look;
  dark: boolean;
  bg: string;
  panel: string;
  deep: string;
  line: string;
  line2: string;
  text: string;
  muted: string;
  track: string;
  cap: string;
  capGroove: string;
  meterBg: string;
  accent: string;
  onAccent: string;
  mute: string;
  onMute: string;
  ok: string;
  /** bouton rotatif : corps, bord, repère */
  knobBody: string;
  knobEdge: string;
  knobMark: string;
}

const base = { mute: '#EF4444', onMute: '#1A0505', ok: '#34D399' };

export const THEMES: Record<string, Theme> = {
  nuit: {
    ...base, id: 'nuit', name: 'Nuit', desc: 'Sombre et sobre, le design par défaut', look: 'flat', dark: true,
    bg: '#111418', panel: '#181C21', deep: '#0E1114', line: '#2A3038', line2: '#3A424C', text: '#E8EAED', muted: '#9AA3AD',
    track: '#262B32', cap: '#D9DDE2', capGroove: '#8A939C', meterBg: '#0B0D10', accent: '#F59E0B', onAccent: '#1A1204',
    knobBody: '#0E1114', knobEdge: '#3A424C', knobMark: '#E8EAED',
  },
  studio: {
    ...base, id: 'studio', name: 'Studio réaliste', desc: 'Métal brossé, potentiomètres moletés, capuchons alu', look: 'real', dark: true,
    bg: '#1B1D20', panel: '#2A2D31', deep: '#16181A', line: '#3B3F45', line2: '#55595F', text: '#F1F2F3', muted: '#A6ABB1',
    track: '#0C0D0E', cap: '#C9CDD2', capGroove: '#6E747B', meterBg: '#08090A', accent: '#F2A33A', onAccent: '#1A1204',
    knobBody: '#3A3E43', knobEdge: '#8D9399', knobMark: '#FFFFFF',
  },
  vintage: {
    ...base, id: 'vintage', name: 'Vintage', desc: 'Console des années 70 : crème, bois, boutons bakélite', look: 'vintage', dark: true,
    bg: '#22180F', panel: '#33261A', deep: '#1A120B', line: '#4E3A26', line2: '#6B5236', text: '#F3E6CF', muted: '#C4AE8A',
    track: '#120C07', cap: '#EADBC0', capGroove: '#8C7553', meterBg: '#0E0905', accent: '#E8A33C', onAccent: '#1E1204',
    knobBody: '#1B1410', knobEdge: '#C9B48E', knobMark: '#F3E6CF', mute: '#D9483B',
  },
  led: {
    ...base, id: 'led', name: 'Anneaux LED', desc: 'Boutons entourés de LED, comme les tables numériques', look: 'led', dark: true,
    bg: '#0D0F12', panel: '#15181C', deep: '#0A0B0D', line: '#23272D', line2: '#343A42', text: '#E6E9EC', muted: '#8E97A1',
    track: '#1E2228', cap: '#D3D7DC', capGroove: '#7E8790', meterBg: '#07080A', accent: '#22D3EE', onAccent: '#04171B',
    knobBody: '#111418', knobEdge: '#2B3037', knobMark: '#22D3EE',
  },
  neon: {
    ...base, id: 'neon', name: 'Néon', desc: 'Noir profond, traits lumineux cyan et magenta', look: 'neon', dark: true,
    bg: '#07060C', panel: '#100E1A', deep: '#05040A', line: '#231E36', line2: '#3A3156', text: '#F2EEFF', muted: '#9C95BA',
    track: '#181428', cap: '#E7E2FF', capGroove: '#8B82B5', meterBg: '#050409', accent: '#F472B6', onAccent: '#1A0612',
    knobBody: '#0B0914', knobEdge: '#3A3156', knobMark: '#22D3EE',
  },
  minimal: {
    ...base, id: 'minimal', name: 'Minimal', desc: 'Traits fins, aucun relief, l’essentiel', look: 'minimal', dark: true,
    bg: '#121212', panel: '#181818', deep: '#0F0F0F', line: '#262626', line2: '#363636', text: '#EDEDED', muted: '#8F8F8F',
    track: '#262626', cap: '#EDEDED', capGroove: '#9A9A9A', meterBg: '#0B0B0B', accent: '#FFFFFF', onAccent: '#121212',
    knobBody: '#121212', knobEdge: '#363636', knobMark: '#FFFFFF', ok: '#A3E635',
  },
  ambre: {
    ...base, id: 'ambre', name: 'Scène ambre', desc: 'Lumière chaude, ne gêne pas dans le noir', look: 'flat', dark: true,
    bg: '#14100A', panel: '#1E1810', deep: '#0F0C07', line: '#3A2E1A', line2: '#5A4826', text: '#F5EBDD', muted: '#B8A68A',
    track: '#33291A', cap: '#E9DCC6', capGroove: '#9C8A6C', meterBg: '#0A0804', accent: '#F59E0B', onAccent: '#140E05', ok: '#5EE0A8',
    knobBody: '#0F0C07', knobEdge: '#5A4826', knobMark: '#F5EBDD',
  },
  contraste: {
    ...base, id: 'contraste', name: 'Contraste fort', desc: 'Noir et jaune, lisible de loin et en plein soleil', look: 'flat', dark: true,
    bg: '#000000', panel: '#0C0C0C', deep: '#000000', line: '#3A3A3A', line2: '#6B6B6B', text: '#FFFFFF', muted: '#D4D4D4',
    track: '#2A2A2A', cap: '#FFE600', capGroove: '#7A6E00', meterBg: '#000000', accent: '#FFE600', onAccent: '#000000',
    knobBody: '#000000', knobEdge: '#FFE600', knobMark: '#FFE600',
  },
  ocean: {
    ...base, id: 'ocean', name: 'Océan', desc: 'Bleus profonds, reposant pour les longues balances', look: 'real', dark: true,
    bg: '#0B1622', panel: '#122233', deep: '#08111B', line: '#1F3650', line2: '#2E4D6E', text: '#E3EEF9', muted: '#8FA8C2',
    track: '#0A1724', cap: '#CFE1F2', capGroove: '#6D8AA6', meterBg: '#060E16', accent: '#38BDF8', onAccent: '#03141F',
    knobBody: '#183049', knobEdge: '#5D86AD', knobMark: '#E3EEF9',
  },
  jour: {
    ...base, id: 'jour', name: 'Plein jour', desc: 'Clair, pour les concerts en extérieur', look: 'flat', dark: false,
    bg: '#EEF0F3', panel: '#FFFFFF', deep: '#E2E6EA', line: '#D3D8DE', line2: '#A9B1BA', text: '#111418', muted: '#4B5563',
    track: '#D3D8DE', cap: '#2B3138', capGroove: '#8A939C', meterBg: '#1F2937', accent: '#B45309', onAccent: '#FFFFFF', mute: '#DC2626', onMute: '#FFFFFF', ok: '#047857',
    knobBody: '#FFFFFF', knobEdge: '#A9B1BA', knobMark: '#111418',
  },
};

export const THEME_ORDER = ['nuit', 'studio', 'vintage', 'led', 'neon', 'minimal', 'ambre', 'contraste', 'ocean', 'jour'];
