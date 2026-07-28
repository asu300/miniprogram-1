const api = require('../../services/api');

Page({
  data: { groups: [], isLoading: true },

  onLoad() { this.loadGroups(); },
  onShow() { this.loadGroups(); },

  loadGroups() {
    this.setData({ isLoading: true });
    api.getExercises().then(res => {
      const allData = res.data || [];
      const map = {};
      allData.forEach(item => {
        const key = item.videoTitle || '未分类';
        if (!map[key]) map[key] = { videoTitle: key, count: 0 };
        map[key].count++;
      });
      this.setData({ groups: Object.values(map), isLoading: false });
    }).catch(err => {
      console.error('加载失败:', JSON.stringify(err));
      this.setData({ isLoading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  goGroup(e) {
    const title = e.currentTarget.dataset.title;
    wx.navigateTo({ url: `/pages/exerciseDetail/exerciseDetail?videoTitle=${encodeURIComponent(title)}` });
  },

  goBack() { wx.navigateBack(); }
});
