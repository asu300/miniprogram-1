// app.js
App({
  onLaunch() {
    // 初始化云开发（APK 中不可用，忽略错误）
    try { wx.cloud.init({ env: 'cloud1-3ggl1ttiaa22fb3e', traceUser: true }); } catch (e) {}
  }
});