// iOS : les Xcode récents enferment les scripts de construction (« User Script
// Sandboxing »), ce qui empêche React Native d'écrire main.jsbundle (EPERM).
// On le coupe pour la cible de l'appli.
const { withXcodeProject } = require('expo/config-plugins');

module.exports = function withNoScriptSandbox(config) {
  return withXcodeProject(config, (c) => {
    const cfgs = c.modResults.pbxXCBuildConfigurationSection();
    for (const k of Object.keys(cfgs)) {
      const b = cfgs[k] && cfgs[k].buildSettings;
      if (b) b.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
    }
    return c;
  });
};
