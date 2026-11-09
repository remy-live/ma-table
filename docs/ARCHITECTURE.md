# Ma table — comment l'appli est rangée

```
App.tsx            navigation (5 sections : Table, Effets, Branchements, Concert, Réglages + Aide-moi + Quitter), préférences, plein écran
src/osc/           encodage / décodage OSC
src/xair/          TOUT ce qui parle à la table, sans interface :
                   XAirClient (liaison, état, annuler), addresses (chemins), wiring, groups,
                   effects + fxSlots, mono, snapshot, presets, autoBalance, monitor, wifiScan
src/store/         ce que l'appli garde : persist, sessions (soirées + sauvegardes), journal, venues
src/ui/            briques d'interface sans logique métier :
                   kit (ScreenHeader, Segmented, Card, Kicker, Btn, SP/RAD/SEM), theme (10 designs),
                   Knob, Fader, HSlider, Strip, GainTile, NavBar, MonoSwitch, useTick, format
src/screens/       un fichier par écran ou par feuille
modules/           code natif Android : wifi-scan, immersive
```

## Règles

1. **Un écran ne parle jamais OSC directement** : il appelle une fonction de `src/xair/`.
   Si elle n'existe pas, on l'ajoute là, avec un test dans `test/`.
2. **Chaque section commence par `ScreenHeader`** (titre, phrase d'aide, onglets et action à droite).
   Les onglets sont toujours un `Segmented`. Une seule action `primary` par écran.
3. **Couleurs** : celles du design viennent de `theme`, celles qui ont un sens fixe
   (danger, attention, ok) de `SEM`. Les couleurs des voies viennent de la table (`colorOf`),
   celles des sorties de `MIX_COLORS`, des effets de `SLOT_COLORS`, des groupes de `GROUP_COLORS`.
4. **Rafraîchir** : `useAnyTick(client)` pour un écran entier, `useParam` pour une valeur.
5. **Tout tient sur l'écran** : pas de défilement pour l'essentiel ; gros boutons (44 px mini).
6. Les adresses non vérifiées sur la vraie table sont marquées « à vérifier » et figurent dans
   le rapport de débogage.

## Trois choix de conception

- **Un seul tiroir d'entrée** : `ChannelDrawer` (onglets Régler / Relier). Il sert pour l'appui sur une
  tranche (`InputSheet`), la vue Table et la face arrière. On n'en dessine pas d'autre.
- **Concert = Scène + Soirées** : « Enregistrer » enregistre la soirée ET fixe le point de retour
  (`saveCurrentSession` écrit aussi `balance`). La liste des soirées et les sauvegardes s'ouvrent depuis là.
- **Branchements = 3 vues** : Table (cliquable), Câbles (face arrière sur tablette, colonnes sur téléphone), Bulles.
