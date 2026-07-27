Page({
  data: {},

  // 跳转到指定分类的文件列表
  goToCategory(e) {
    const category = e.currentTarget.dataset.category;
    wx.navigateTo({
      url: `/pages/list/list?category=${category}`
    });
  },

  // 跳转到上传页
  goToUpload() {
    wx.navigateTo({
      url: '/pages/upload/upload'
    });
  }
});