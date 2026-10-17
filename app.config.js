const app = require('./app.json');
const variants = require('./app-variants.json');

const variantName = process.env.APP_VARIANT ?? 'stable';
if (!Object.hasOwn(variants, variantName)) throw new Error(`Unsupported APP_VARIANT: ${variantName}`);
const variant = variants[variantName];

module.exports = {
  ...app,
  expo: {
    ...app.expo,
    name: variant.name,
    slug: variant.slug,
    scheme: variant.scheme,
    extra: {
      ...app.expo.extra,
      buildVariant: variantName,
    },
    ios: {
      ...app.expo.ios,
      bundleIdentifier: variant.androidPackage,
    },
    android: {
      ...app.expo.android,
      package: variant.androidPackage,
    },
  },
};
