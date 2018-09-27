'use strict'
require('./check-versions')()

process.env.NODE_ENV = 'production'

const ora = require('ora')
const rm = require('rimraf')
const path = require('path')
const chalk = require('chalk')
const webpack = require('webpack')
const config = require('../config')

const spinner = ora('building for production...');
spinner.start();

function build(webpackConfig) {
  return new Promise(function (resolve, reject) {
    webpack(webpackConfig, (err, stats) => {
      if (err) reject(err);
      process.stdout.write(stats.toString({
          colors: true,
          modules: false,
          children: false, // If you are using ts-loader, setting this to true will make TypeScript errors show up during build.
          chunks: false,
          chunkModules: false
        }) + '\n\n');

      if (stats.hasErrors()) {
        console.log(chalk.red('  Build failed with errors.\n'));
        process.exit(1);
      }
      resolve();
    })
  });
}

rm(path.join(config.build.assetsRoot, config.build.assetsSubDirectory), err => {
  if (err) throw err;
  console.log(chalk.red('  Building for production...\n'));
  const webpackConfig = require('./webpack.prod.conf');
  const webpackConfigMin = require('./webpack.min.conf');
  Promise.all([build(webpackConfig), build(webpackConfigMin)]).then(function () {
    spinner.stop();
    console.log(chalk.cyan('  Build complete.\n'));
    console.log(chalk.yellow(
      '  Tip: built files are meant to be served over an HTTP server.\n' +
      '  Opening index.html over file:// won\'t work.\n'));
  }).catch(function (err) {
    console.log(chalk.red(err + '\n'));
  });
});

