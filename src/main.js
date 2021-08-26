/*
 * @Description: 
 * @Author: Liu Yang
 * @Date: 2021-08-17 13:33:52
 * @LastEditTime: 2021-08-25 13:50:51
 * @LastEditors: Liu Yang
 * @FilePath: \earth-vue\src\main.js
 */
import Vue from 'vue'
import App from './App.vue'
import store from './store/store.js'
console.log(store)
import '@/assets/styles/styles.css'


import iView from 'iview';
import 'iview/dist/styles/iview.css';

import ElementUI from 'element-ui';
import 'element-ui/lib/theme-chalk/index.css';
import Moment from 'moment'

Vue.prototype.moment = Moment
Vue.config.productionTip = false //阻止启动生产消息 ,减少用户体积
Vue.use(ElementUI);
Vue.use(iView);


new Vue({
  store,
  render: h => h(App),
}).$mount('#app')
