const { withModuleFederationPlugin } = require('@angular-architects/module-federation/webpack');

const config = withModuleFederationPlugin({
  name: 'pfk_bulk_change',
  filename: 'remoteModuleEntry.js',
  exposes: {
    './Main': './src/main.ts',
  },
  shared: {},
  sharedMappings: [],
});

config.resolve.alias.lodash = 'lodash-es';
config.output.uniqueName = 'pfk_bulk_change';
config.optimization.splitChunks = {
  ...config.optimization.splitChunks,
  chunks: 'all'
};

module.exports = config;