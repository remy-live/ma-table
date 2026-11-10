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
  rouge: {
    ...base, id: 'rouge', name: 'Nuit rouge', desc: 'Très sombre, tout en rouge : n’éblouit pas sur une scène noire', look: 'flat', dark: true,
    bg: '#050101', panel: '#0D0303', deep: '#030000', line: '#2A0A0A', line2: '#3D1010', text: '#E05252', muted: '#8A2E2E',
    track: '#1C0606', cap: '#B83C3C', capGroove: '#5A1A1A', meterBg: '#030000', accent: '#D93A3A', onAccent: '#140202',
    knobBody: '#0A0202', knobEdge: '#4A1414', knobMark: '#E05252', mute: '#7A1A1A', onMute: '#F08080', ok: '#C04848',
  },
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
  foret: {
    ...base, id: 'foret', name: 'Forêt', desc: 'Verts sombres et mousse, très doux pour les yeux', look: 'flat', dark: true,
    bg: '#0E1511', panel: '#152019', deep: '#0A100C', line: '#22332A', line2: '#33493C', text: '#E4EFE7', muted: '#93AA9B',
    track: '#1C2A22', cap: '#D7E6DB', capGroove: '#7C9384', meterBg: '#070B08', accent: '#4ADE80', onAccent: '#04160A',
    knobBody: '#0A100C', knobEdge: '#33493C', knobMark: '#E4EFE7',
  },
  lave: {
    ...base, id: 'lave', name: 'Lave', desc: 'Noir volcanique, accents orange brûlé', look: 'real', dark: true,
    bg: '#150C0A', panel: '#221310', deep: '#0F0807', line: '#3B211B', line2: '#573127', text: '#F7E7E1', muted: '#C09A8E',
    track: '#120908', cap: '#EED5CB', capGroove: '#8E6A5E', meterBg: '#0A0504', accent: '#F97316', onAccent: '#1C0802', mute: '#E11D48',
    knobBody: '#2A1713', knobEdge: '#7A4A3C', knobMark: '#F7E7E1',
  },
  violet: {
    ...base, id: 'violet', name: 'Améthyste', desc: 'Violets profonds, accent lilas', look: 'flat', dark: true,
    bg: '#110D19', panel: '#1A1426', deep: '#0C0912', line: '#2C2240', line2: '#43345F', text: '#EEE8FA', muted: '#A699C2',
    track: '#231B34', cap: '#E2DAF5', capGroove: '#867AA6', meterBg: '#08060D', accent: '#A78BFA', onAccent: '#140A2A',
    knobBody: '#0C0912', knobEdge: '#43345F', knobMark: '#EEE8FA',
  },
  cuivre: {
    ...base, id: 'cuivre', name: 'Cuivre', desc: 'Faders et boutons cuivrés, comme une console boutique', look: 'real', dark: true,
    bg: '#16120F', panel: '#231C17', deep: '#100D0B', line: '#3A2F26', line2: '#57463A', text: '#F4EBE3', muted: '#B7A493',
    track: '#0D0A08', cap: '#D9A77A', capGroove: '#7E5A3C', meterBg: '#090706', accent: '#D9894A', onAccent: '#1D0F05',
    knobBody: '#3B2C21', knobEdge: '#C08552', knobMark: '#F4EBE3',
  },
  graphite: {
    ...base, id: 'graphite', name: 'Graphite', desc: 'Gris neutres, accent bleu acier, très pro', look: 'real', dark: true,
    bg: '#17191C', panel: '#202327', deep: '#121417', line: '#30343A', line2: '#454A52', text: '#ECEEF0', muted: '#9CA2AA',
    track: '#0E1012', cap: '#C4CAD1', capGroove: '#6B727A', meterBg: '#0A0B0C', accent: '#60A5FA', onAccent: '#04111F',
    knobBody: '#2B2F34', knobEdge: '#6B727A', knobMark: '#FFFFFF',
  },
  synthwave: {
    ...base, id: 'synthwave', name: 'Synthwave', desc: 'Années 80 : violet nuit, rose et cyan', look: 'neon', dark: true,
    bg: '#120A20', panel: '#1C1030', deep: '#0C0716', line: '#33204F', line2: '#4E3274', text: '#FBEFFF', muted: '#B49BCF',
    track: '#1F1236', cap: '#FFD1F2', capGroove: '#9D6FB8', meterBg: '#0A0512', accent: '#FF4FD8', onAccent: '#24031C',
    knobBody: '#150B26', knobEdge: '#4E3274', knobMark: '#38F0FF', ok: '#38F0FF',
  },
  menthe: {
    ...base, id: 'menthe', name: 'Menthe', desc: 'Bleu nuit et vert menthe, net et frais', look: 'led', dark: true,
    bg: '#0A1316', panel: '#111D21', deep: '#071012', line: '#1C2E33', line2: '#2B454C', text: '#E2F4F2', muted: '#8FB0AD',
    track: '#16262A', cap: '#CFEDEA', capGroove: '#6F9894', meterBg: '#050B0C', accent: '#2DD4BF', onAccent: '#031714',
    knobBody: '#0D181B', knobEdge: '#2B454C', knobMark: '#2DD4BF',
  },
  sable: {
    ...base, id: 'sable', name: 'Sable', desc: 'Clair et chaud, papier crème, pour la journée', look: 'flat', dark: false,
    bg: '#F3EDE2', panel: '#FBF8F2', deep: '#E8E0D1', line: '#D9CDB8', line2: '#B5A68D', text: '#2A2118', muted: '#6B5C49',
    track: '#DDD2BE', cap: '#3A2F24', capGroove: '#8C7C66', meterBg: '#2A2118', accent: '#B45309', onAccent: '#FFFFFF', mute: '#C2410C', onMute: '#FFFFFF', ok: '#15803D',
    knobBody: '#FBF8F2', knobEdge: '#B5A68D', knobMark: '#2A2118',
  },
  glace: {
    ...base, id: 'glace', name: 'Glace', desc: 'Blanc bleuté et bleu vif, lumineux', look: 'minimal', dark: false,
    bg: '#EAF1F8', panel: '#F8FBFE', deep: '#DCE6F1', line: '#C9D6E4', line2: '#97A9BE', text: '#0F1B2A', muted: '#4A5B70',
    track: '#CCD8E6', cap: '#1E3A5F', capGroove: '#7D90A8', meterBg: '#0F1B2A', accent: '#1D4ED8', onAccent: '#FFFFFF', mute: '#DC2626', onMute: '#FFFFFF', ok: '#047857',
    knobBody: '#F8FBFE', knobEdge: '#97A9BE', knobMark: '#0F1B2A',
  },
  papier: {
    ...base, id: 'papier', name: 'Papier', desc: 'Noir sur blanc, sans couleur superflue', look: 'minimal', dark: false,
    bg: '#FFFFFF', panel: '#F7F7F7', deep: '#EDEDED', line: '#DADADA', line2: '#A3A3A3', text: '#0A0A0A', muted: '#525252',
    track: '#DADADA', cap: '#0A0A0A', capGroove: '#8A8A8A', meterBg: '#0A0A0A', accent: '#0A0A0A', onAccent: '#FFFFFF', mute: '#DC2626', onMute: '#FFFFFF', ok: '#15803D',
    knobBody: '#FFFFFF', knobEdge: '#A3A3A3', knobMark: '#0A0A0A',
  },
};

export const THEME_ORDER = ['nuit', 'studio', 'graphite', 'vintage', 'cuivre', 'led', 'menthe', 'neon', 'synthwave', 'minimal', 'ambre', 'lave', 'foret', 'violet', 'ocean', 'contraste', 'jour', 'sable', 'glace', 'papier', 'rouge'];
