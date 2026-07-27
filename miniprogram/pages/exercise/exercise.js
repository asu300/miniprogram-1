Page({
  data: {
    groups: [],
    isLoading: true
  },

  onLoad() {
    this.loadGroups();
  },

  onShow() {
    this.loadGroups();
  },

  loadGroups() {
    this.setData({ isLoading: true });
    const db = wx.cloud.database();
    const _ = db.command;
    const batchSize = 20;
    let allData = [];

    const fetchBatch = (skip) => {
      db.collection('exercises')
        .orderBy('createTime', 'desc')
        .skip(skip)
        .limit(batchSize)
        .get()
        .then(res => {
          allData = allData.concat(res.data);
          if (res.data.length < batchSize) {
            // 已取完所有数据
            this._groupByTitle(allData);
          } else {
            fetchBatch(skip + batchSize);
          }
        })
        .catch(err => {
          console.error('加载失败:', JSON.stringify(err));
          this.setData({ isLoading: false });
          wx.showToast({ title: '加载失败', icon: 'none' });
        });
    };

    fetchBatch(0);
  },

  _groupByTitle(data) {
    const map = {};
    data.forEach(item => {
      const key = item.videoTitle || '未分类';
      if (!map[key]) {
        map[key] = { videoTitle: key, count: 0 };
      }
      map[key].count++;
    });
    const groups = Object.values(map);
    this.setData({ groups, isLoading: false });
  },

  goGroup(e) {
    const title = e.currentTarget.dataset.title;
    wx.navigateTo({ url: `/pages/exerciseDetail/exerciseDetail?videoTitle=${encodeURIComponent(title)}` });
  },

  goBack() {
    wx.navigateBack();
  }
});
