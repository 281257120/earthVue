/*
 * @Description: 
 * @Author: Liu Yang
 * @Date: 2021-08-23 09:53:24
 * @LastEditTime: 2021-08-23 10:34:06
 * @LastEditors: Liu Yang
 * @FilePath: \earth-vue\src\store\store.js
 */
import Vue from 'vue'
import Vuex from 'vuex'
import state from './state'

import actions from './actions'
import getters from './getters'
import mutations from './mutations'
import homePage from './modules/homePage'



Vue.use(Vuex)
export default new Vuex.Store({
  state,
  actions,
  getters,
  mutations,
  modules: {
    homePage,
  }
})