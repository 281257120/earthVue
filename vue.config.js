/*
 * @Description: 
 * @Author: Liu Yang
 * @Date: 2020-11-05 09:43:22
 * @LastEditTime: 2021-08-26 17:14:00
 * @LastEditors: Liu Yang
 * @FilePath: \earth-vue\vue.config.js
 */
const webpack = require('webpack')
module.exports = {
  lintOnSave: false,
  devServer: {
    // host: 'localhost',
    port: 9000,
    // proxy: {
    //   '/api1': {
    //     target: 'http://192.168.1.118:9000/',
    //     changeOrigin: true,
    //     pathRewrite: {
    //       '^/api1': ''
    //     }
    //   },
    //   '/api2': {
    //     target: 'http://192.168.1.118:2000/',
    //     changeOrigin: true,
    //     pathRewrite: {
    //       '^/api2': ''
    //     }
    //   },
    // }
  },
  configureWebpack: {
    plugins: [
      new webpack.ProvidePlugin({
        $: "jquery",

        jQuery: "jquery",

        "windows.jQuery": "jquery"

      })
    ]
  },
  publicPath: process.env.NODE_ENV === 'production' ? './earthVue' : './',
  assetsDir: "static"
}