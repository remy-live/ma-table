// Taille du texte Android : si la tablette grossit le texte (Réglages › Affichage),
// les écrans « tout sur une page » débordent. On plafonne le grossissement à 100 %
// (jamais plus petit que la normale), dans l'activité et dans l'application.
const { withMainActivity, withMainApplication } = require('expo/config-plugins');

const MARK = '// ma-table: fontScale';
const HELPER = `
${MARK}
private fun capFontScale(res: android.content.res.Resources) {
  val c = android.content.res.Configuration(res.configuration)
  if (c.fontScale > 1f) {
    c.fontScale = 1f
    @Suppress("DEPRECATION")
    res.updateConfiguration(c, res.displayMetrics)
  }
}
`;

function addHelper(src) {
  if (src.includes(MARK)) return src;
  return src.trimEnd() + '\n' + HELPER;
}

module.exports = function withFontScale(config) {
  config = withMainActivity(config, (c) => {
    let s = c.modResults.contents;
    if (!s.includes(MARK)) {
      s = s.replace('    super.onCreate(null)', '    capFontScale(resources); capFontScale(applicationContext.resources)\n    super.onCreate(null)');
      s = s.replace(/\n}\s*$/, `

  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
    super.onConfigurationChanged(newConfig)
    capFontScale(resources); capFontScale(applicationContext.resources)
  }
}
`);
      s = addHelper(s);
    }
    c.modResults.contents = s;
    return c;
  });
  config = withMainApplication(config, (c) => {
    let s = c.modResults.contents;
    if (!s.includes(MARK)) {
      s = s.replace(/override fun onCreate\(\) \{\n/, (m) => m + '    capFontScale(resources)\n');
      s = addHelper(s);
    }
    c.modResults.contents = s;
    return c;
  });
  return config;
};
