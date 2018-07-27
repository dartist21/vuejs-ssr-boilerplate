const webpack = require('webpack');
const merge = require('webpack-merge');
const base = require('./webpack.base.config');
const nodeExternals = require('webpack-node-externals');
const VueSSRServerPlugin = require('vue-server-renderer/server-plugin');

module.exports = merge.smart(base, {
  target: 'node',
  devtool: '#source-map',
  entry: './src/entry-server.js',
  output: {
    filename: '[name].[chunkhash].js',
    libraryTarget: 'commonjs2',
  },
  externals: nodeExternals({
    whitelist: [/\.css$/, /\?vue&type=style/],
  }),
  module: {
    // important on server side
    // because sadly new extract css plugin doesn't support server side css
    rules: [
      {
        test: /\.(css)$/,
        use: ['vue-style-loader', 'css-loader', 'postcss-loader'],
      },
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      'process.env.VUE_ENV': '"server"',
      'process.browser': false,
      'process.client': false,
      'process.server': true,
    }),
    new VueSSRServerPlugin(),
  ],
});
