const { withAppBuildGradle } = require('expo/config-plugins');

const begin = '// @generated begin quotivo-short-cmake-staging';
const end = '// @generated end quotivo-short-cmake-staging';
const block = `${begin}
    // Windows: keep CMake/Ninja intermediates below MAX_PATH.
    // Override only when a different short absolute path is explicitly required.
    def quotivoCmakeStagingDir = System.getenv('QUOTIVO_CMAKE_STAGING_DIR') ?: 'C:/qv-cxx'
    externalNativeBuild {
        cmake {
            buildStagingDirectory file(quotivoCmakeStagingDir)
        }
    }
${end}`;

function applyShortCmakeStaging(contents) {
  const existing = new RegExp(`${begin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  const withoutExisting = contents.replace(existing, '').replace(/android\s*\{/, (match) => `${match}\n${block}`);
  if (!withoutExisting.includes(begin)) throw new Error('Blocco android non trovato in android/app/build.gradle.');
  return withoutExisting;
}

module.exports = function withShortCmakeStaging(config) {
  return withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') throw new Error('Quotivo supporta il fix CMake solo per build.gradle Groovy.');
    gradleConfig.modResults.contents = applyShortCmakeStaging(gradleConfig.modResults.contents);
    return gradleConfig;
  });
};

module.exports.applyShortCmakeStaging = applyShortCmakeStaging;
