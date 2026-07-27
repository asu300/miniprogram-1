// app.js
App({
  onLaunch() {
    // 初始化云开发
    wx.cloud.init({
      env: 'cloud1-3ggl1ttiaa22fb3e', 
      traceUser: true
    });
  }
});