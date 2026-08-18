/**
 * Tailwind's PostCSS pass, which is what makes `@import "tailwindcss"`,
 * `@theme inline`, `@plugin` and `@apply` in src/css/custom.css mean anything.
 *
 * Docusaurus configures postcss-loader without `config: false`, so the loader
 * also picks this file up from the site root and runs its plugins BEFORE its
 * own postcss-preset-env pass — which is the order Tailwind needs.
 *
 * `autoprefixer` is not listed, where the predecessor listed it: Docusaurus's
 * own pass is postcss-preset-env, which runs autoprefixer itself. A second copy
 * is a second dependency prefixing already-prefixed output.
 */
module.exports = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
