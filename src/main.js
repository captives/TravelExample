// The Vue build version to load with the `import` command
// (runtime-only or standalone) has been set in webpack.base.conf with an alias.
import Vue from 'vue'
import App from './App'
import fastclick from 'fastclick'
import router from './router'
import './assets/style/reset.css'
import './assets/style/border.css'

Vue.config.productionTip = false;
fastclick.attach(document.body);

/* eslint-disable no-new */
new Vue({
  el: '#app',
  router,
  render: h => h(App),
  // components: {App},
  // template: '<App/>'
});