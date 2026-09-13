const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const svgAssets = [
  ['quotivo-logo-master.svg', 'quotivo_logo_master.svg'],
  ['quotivo-mark.svg', 'quotivo_mark.svg'],
];

module.exports = function withQuotivoSvgAssets(config) {
  return withDangerousMod(config, ['android', async (modConfig) => {
    const destinationDirectory = path.join(modConfig.modRequest.platformProjectRoot, 'app', 'src', 'main', 'assets');
    fs.mkdirSync(destinationDirectory, { recursive: true });

    for (const [sourceName, destinationName] of svgAssets) {
      fs.copyFileSync(
        path.join(modConfig.modRequest.projectRoot, 'asset', sourceName),
        path.join(destinationDirectory, destinationName)
      );
    }

    return modConfig;
  }]);
};
