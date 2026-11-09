# Ma table — appli XR16 · version « prête pour un concert »

## Télécharger l'APK Android

Sur le téléphone, ouvre : **https://github.com/remy-live/ma-table/releases/latest/download/ma-table.apk**
(toujours la dernière version), puis installe-la. Chaque envoi sur `main` fabrique une nouvelle version
(onglet **Actions**, 10 à 20 min) ; elle s'installe par-dessus l'ancienne sans perdre les réglages.

L'APK est autonome : pas besoin du Mac ni de `npm start`.
Pour l'iPhone : `npx expo run:ios --device --configuration Release` depuis le Mac (voir plus bas).

`signing/debug.keystore` sert seulement à garder la même signature d'une version à l'autre
(sinon Android refuse la mise à jour). Ce n'est pas une clé Play Store.

Trois onglets en bas : **Table**, **Scène**, **Connexion**.

- **Table (direction A)** : bouton de gain, témoins 48 V / Ø, pan, bandeau de nom coloré, vumètre, EQ et FX sous chaque voie.
  - **Groupes repliables** : un groupe (ex. Batterie) prend la place de ses voies ; « Déplier ▸ » les montre, − / + ou le fader
    montent tout le groupe — dans la façade (vrai groupe DCA) ou dans le retour choisi en haut.
  - **« CH ⋯ »** sur une voie : Copier, Coller (choix de ce qu'on colle et sur quelles voies), Déplacer, Échanger.
  - **Toucher le nom** : renommage intelligent (« Kick » → couleur, groupe Batterie, préréglage ; 48 V proposé avec confirmation).
- **Scène (télécommande)** : enregistrer la balance puis « Revenir à la balance » d'un geste, groupes en gros boutons
  par mix (façade ou retour), pause de la façade, verrou (bloque les autres onglets).
- **Connexion** : état de la liaison, reconnexions, sauvegarde (export / import), conseil routeur, déconnexion.

## Nouveau dans la 0.8 : UX v2 (après le premier test sur la XR18)

- **Console** : en haut, « Les faders règlent ce qu'entend : Le public ▾ » (choix avec des visages ; les effets à part, en
  avancé). Chaque voie affiche sa **prise** et son type (micro, 48 V, ligne, USB). **⋯** sous la voie → bandeau
  « ✓ SÉLECTIONNÉE » et barre : ◀ Déplacer ▶, **Copier les réglages vers…** (les autres voies deviennent des cibles
  « + Coller ici »), **Échanger avec…** (réglages ET place), **Changer l'entrée** (quelle prise, ou l'USB), Renommer.
- **Voie** : le trajet du son en blocs (Entrée › Coupe-bas › Gate › EQ › Comp › Effets), **EQ dessiné** (4 points, raccourcis
  « Moins de boum », « Plus de clarté »…), effets en tuiles avec **✕ Retirer**, et « Qui entend cette voie ».
- **Branchements** (Outils) : 3 vues — **face arrière** de la XR18 en vectoriel (prises numérotées, fils source → sortie,
  épaisseur = niveau), **colonnes** (téléphone), **bulles** (le tableau « Qui entend quoi »). Touche une prise puis une
  sortie = un fil. « Vers tous les retours », « Comme le public ».
- **Inviter** : des visages (prénoms pris sur les noms des retours), QR code en 3 images, droits en tuiles.
- **Mes soirées** : la soirée en cours, Enregistrer, **Nouvelle soirée** (repartir du même réglage, de la balance, ou d'une
  table vide), Reprendre, Envoyer / Recevoir (texte), **copie dans la table** (64 emplacements internes, rappelables
  sans téléphone avec l'appli X AIR).
- **Sauvegardes en couches** : à la connexion, toutes les 10 min, avant chaque opération risquée (12 gardées).
- **Scène** : bouton **AU SECOURS · larsen** (tous les retours −6 dB, réversible), **check-list avant concert**,
  **journal** (qui a changé quoi, et quand — cet appareil ou un autre), modes **Concert** (verrouillé) / **Balance**.

## Nouveau dans la 0.7 : Balance automatique (Outils › Balance automatique)

Pose le téléphone : il dit **à voix haute** qui doit jouer (« Batteur. Grosse caisse seule : un coup par seconde, fort »),
**attend que ça joue** (ou bouton **Prêt**), écoute quelques secondes, règle, dit « Merci » et passe au suivant.

- Déroulé complet : silence (bruit de fond → gates) · **batterie élément par élément** (kick, caisse claire, charley,
  chaque tom, ride, overheads) · basse · guitares · claviers · chœurs · voix · **tous ensemble**.
- Chaque solo règle le **gain** (pic visé −12 dB, 18 dB max par passage, jamais de 48 V). Compresseur et gate si déjà en service.
- **Erreur de prise** détectée (« le kick arrive sur la prise 6 ») → corriger en un geste.
- **Micros qui entendent trop leurs voisins** signalés dans le rapport (pas entre micros de batterie : c'est normal).
- Tous ensemble : **faders** selon le rôle (voix devant, basse et kick juste derrière…), **retours** préparés pour chaque
  retour nommé (son instrument +6 dB, la voix pour tout le monde), **volume général** vérifié.
- **Rapport** voie par voie (✓ / ⚠), « Appliquer », **Annuler tout**, **Garder pour cette salle** (et repartir d'une salle).
- **Express (30 s)** : tous ensemble seulement, pour le concert suivant.

## Nouveau dans la 0.6 : bouton « Outils » (en haut de la table)

- **Mode guidé** : 5 étapes — ce qui est branché (prise par prise), mes groupes, qui veut entendre quoi
  (Rien / Un peu / Moyen / Fort par personne), l'ambiance (sec, un peu d'espace, grand et doux, + écho), la balance
  (vumètre + « Parfait » / « Trop fort » + Gain − / +). « Terminer » enregistre la balance.
- **Effets de la table** : FX1 à FX4, catalogue par famille en français, 8 recettes (Voix pop, Ballade, Petite salle,
  Caisse claire 80s, Slapback, Écho au tempo, Chorus guitare, Orgue Leslie), 3 réglages clairs, **TAP tempo**,
  niveau du retour, « Qui l'utilise » (envoi de chaque voie). Aussi depuis une voie : « Régler FX1… ».
- **Préréglages** : bibliothèque par famille avec variantes (Voix lead, rock, chœurs, parlée ; guitares arpèges,
  rythmique, clean, crunch ; basse ronde, claquante ; kick rock / jazz, cajon ; piano, nappe…), appliquer sur
  plusieurs voies d'un coup, **Mes réglages** (garder le réglage d'une voie). Aussi depuis une voie : « Bibliothèque… ».
- **Qui entend quoi** : le routage en clair, par personne ou par source, groupes dépliables, « Isoler ».
- **Sécurité concert** : alerte quand une entrée sature (bouton « Régler »), **écran toujours allumé**,
  **sauvegarde automatique** de toute la table à chaque connexion (Connexion › Sauvegardes automatiques).

## Mode « Mon retour » (mieux que MXBus)

Onglet **Scène › Inviter un musicien** : choisis son retour (AUX 1 à 6), ses voies à lui (pour « Plus de moi ») et ses
droits. Il scanne le **QR code** avec l'appareil photo : l'appli s'ouvre directement sur SON retour, verrouillée.
Sans QR : sur l'écran de connexion, **« Rejoindre »** avec le code `172.20.10.2 · 1` (adresse de la table · retour).

- **Plus de moi / Plus des autres** (+2 dB), une ligne par source, voies liées en stéréo = une seule ligne.
- **Groupes dépliables** dans le retour (Batterie −2 dB = ses 5 voies d'un coup, équilibre gardé).
- **Protège-oreilles** : compresseur du bus en limiteur (−6 dB, rapport ∞). Le musicien ne peut le couper que si tu l'autorises.
- **Ma balance** : gardée avec le numéro du bus — impossible de la recharger sur le retour d'un autre.
- **Éco** : vumètre ralenti pour la batterie. **Appui long sur 🔒** pour quitter.
- « Essayer ici » (depuis l'invitation) ou « Essayer le mode musicien en démo » (écran de connexion).

## Débogage

Onglet **Connexion › Débogage** (ou, sans table, « Débogage : envoyer le journal » sur l'écran de connexion) :
journal en direct, **Lancer le diagnostic** (lit dans la table les numéros d'effets, les plages du coupe-bas / gate /
compresseur, l'EQ, les préamplis, le réseau, les vumètres), **Envoyer le rapport** (partage du texte), et lecture
d'une adresse OSC à la main.

## Réseau : partage de connexion du téléphone

Onglet **Connexion › Réseau de la table** : l'appli enregistre dans la XR16 le nom et le mot de passe de ton partage
de connexion (ou d'un routeur). Ensuite : interrupteur **REMOTE** à l'arrière sur **WIFI CLIENT**, puis sur l'écran de
connexion **« Chercher sur mon partage de connexion »** (l'appli interroge les adresses habituelles des partages iPhone
et Android). La dernière table utilisée est retenue (« Reconnecter à la dernière table »).
Retour au Wi-Fi d'usine de la table : REMOTE sur ACCESS POINT (et RESET 2 s si besoin).

## ⚠ Une recompilation cette fois

Le QR code doit ouvrir l'appli (lien `matable://`) l'écran doit rester allumé et le téléphone parle : ce sont des modules natifs. Après la mise à jour :

```bash
npm install
npx expo install --fix
eas build -p android --profile development
```

Ensuite, comme avant, `npm start` suffit. Sans recompiler, tout marche sauf l'ouverture par l'appareil photo (le code « Rejoindre » marche).

---

## Détail des étapes précédentes (1 à 6)

- Connexion (recherche auto ou adresse IP), lecture de l'état de la table, reconnexion propre
- 16 voies + sortie, faders verticaux, mute, renommage, 3 thèmes
- **« Les faders règlent… »** : Façade, Retours 1 à 6 (noms lus dans la table), Effets 1 à 4.
  Sur un retour : bouton « Copier le mix façade ».
- **Groupes** (bouton Groupes) : 4 groupes enregistrés dans la table (DCA). Sur la façade, c'est le vrai DCA ;
  sur un retour ou un effet, le fader de groupe décale toutes ses voies du même nombre de dB.
- **EQ · FX** sous chaque voie : préréglages par instrument, EQ 4 bandes, coupe-bas, gate, compresseur, envois FX1-4.
- **Entrée** (bouton sous le nom, ex. « +32 dB ») : gain du préampli, 48 V (avec confirmation), phase, panoramique,
  et un vumètre qui dit « trop faible / bon niveau / ça sature ». Entrées 9-16 de la XR16 = lignes, sans gain.
- **Vumètres** à LED sur chaque voie (entrée) et sur la sortie, témoin rouge de saturation.
- Simulateur de XR16 pour travailler sans table (un groupe « Batterie » y est déjà créé)

## Installer

```bash
npm install
npx expo install --fix      # aligne les versions sur ton SDK Expo
```

L'appli utilise un module natif (UDP), donc **Expo Go ne suffit pas** : il faut une « dev build ».

- **Android** (Android Studio installé, téléphone en mode développeur) : `npx expo run:android`
- **iPhone** (Xcode, sur le Mac) : `npx expo run:ios --device`

Ensuite, au quotidien : `npm start` puis ouvrir l'appli installée.

## Travailler sans la table

1. Sur le Mac : `npm run simu` (ou `npm run simu:bouge` : la voie 1 bouge toute seule, pour voir la réception).
2. Adresse du Mac : `ipconfig getifaddr en0`
3. Dans l'appli : « Par adresse IP » → l'adresse du Mac → Connecter.

Ou sans rien du tout : bouton **Essayer sans table (démo)** dans l'appli.

## Gestes du fader

- Glisser : réglage normal
- Rester appuyé ~0,4 s puis glisser : réglage fin (le capuchon s'entoure d'orange)
- Double-tap : retour à 0 dB

## Tests

```bash
npm test          # OSC, conversions dB, client contre le simulateur
npm run typecheck
```

## À savoir

- **À vérifier sur ta table** : la plage du coupe-bas (20-400 Hz supposé), du seuil de gate (-80..0 dB) et du compresseur (-60..0 dB).
  Si les valeurs affichées ne correspondent pas à Mixing Station, dis-le : c'est une ligne à changer dans `src/xair/addresses.ts`.

- **Recherche auto sur iPhone** : envoyer en diffusion demande à Apple une autorisation spéciale
  (« multicast networking »). En attendant, sur iPhone, connecte-toi par adresse IP. Sur Android, la recherche marche.
- La table reste la référence : à la connexion et après une coupure Wi-Fi, l'appli **relit** la table et ne renvoie jamais d'anciennes valeurs.

## Organisation

```
src/osc/osc.ts            encodeur/décodeur OSC
src/xair/XAirClient.ts    connexion, /xremote, lecture d'état, envoi lissé, reconnexion
src/xair/udpTransport.ts  UDP du téléphone      src/xair/demoTransport.ts  table imitée
src/xair/useParam.ts      hooks React (fader, mute, nom)
src/ui/                   Fader, tranches, thèmes
src/screens/              Connexion, Table
sim/xr16-sim.ts           simulateur pour le Mac
```

Prochaine étape : appliquer la direction de design choisie, puis l'EQ et le limiteur de sortie.
