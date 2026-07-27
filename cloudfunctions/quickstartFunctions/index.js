Page({
  data: {
    fileList: [] // 存储文件列表
  },

  onLoad() {
    // 从云数据库读取文件，并按时间倒序排序
    wx.cloud.database().collection('files')
      .orderBy('createTime', 'desc') // 按 createTime 降序排列
      .get()
      .then(res => {
        this.setData({ fileList: res.data });
      })
      .catch(err => {
        console.error('获取文件失败:', err);
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  // 点击预览文件
  previewFile(e) {
    const cloudPath = e.currentTarget.dataset.path;
    wx.cloud.downloadFile({
      fileID: cloudPath,
      success: (res) => {
        wx.openDocument({
          filePath: res.tempFilePath,
          showMenu: true
        });
      },
      fail: () => {
        wx.showToast({ title: '无法打开文件', icon: 'none' });
      }
    });
  }
});