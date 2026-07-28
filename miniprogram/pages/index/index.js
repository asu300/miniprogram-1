const CATEGORY_MAP = {
  recent_announcement: '飞行部重要宣贯',
  zhengzhou_jinai: '郑州 → 金奈',
  zhengzhou_delhi: '郑州 → 德里',
  zhengzhou_liege: '郑州 → 列日',
  zhengzhou_budapest: '郑州 → 布达佩斯',
  zhengzhou_bangalore: '郑州 → 班加罗尔',
  zhengzhou_north_america: '郑州 → 北美',
  b747_ops: 'B747 手册',
  other_important: '其它重要资料',
  media_resources: '音视频资料'
};

const api = require('../../services/api');

Page({
  data: {
    searchKeyword: '',
    searchResults: [],
    isSearching: false,
    hasSearched: false,
    currentPage: 0,
    scrollLeft: 0,
    aiFloatExpanded: false
  },

  screenWidth: 0,
  aiHideTimer: null,

  onLoad() { this.screenWidth = wx.getSystemInfoSync().windowWidth; },

  onShow() { this.setData({ aiFloatExpanded: false }); },

  onScroll(e) {
    const scrollLeft = e.detail.scrollLeft;
    const page = Math.round(scrollLeft / this.screenWidth);
    if (page !== this.data.currentPage) this.setData({ currentPage: page });
  },

  goPage(e) {
    const page = Number(e.currentTarget.dataset.page);
    this.setData({ scrollLeft: page * this.screenWidth, currentPage: page });
  },

  goList(e) { wx.navigateTo({ url: `/pages/list/list?category=${e.currentTarget.dataset.cat}` }); },
  goExercise() { wx.navigateTo({ url: '/pages/exercise/exercise' }); },
  goUpload() { wx.navigateTo({ url: '/pages/upload/upload' }); },
  goAi() { wx.navigateTo({ url: '/pages/ai/ai' }); },

  showAiFloat() {
    if (this.aiHideTimer) clearTimeout(this.aiHideTimer);
    this.setData({ aiFloatExpanded: true });
  },

  hideAiFloat() {
    this.aiHideTimer = setTimeout(() => this.setData({ aiFloatExpanded: false }), 600);
  },

  onAiFloatTap() {
    if (this.aiHideTimer) clearTimeout(this.aiHideTimer);
    this.setData({ aiFloatExpanded: false });
    wx.navigateTo({ url: '/pages/ai/ai' });
  },

  onSearchInput(e) { this.setData({ searchKeyword: e.detail.value }); },

  onSearch() {
    const keyword = this.data.searchKeyword.trim();
    if (!keyword) { wx.showToast({ title: '请输入关键词', icon: 'none' }); return; }
    this.setData({ isSearching: true, hasSearched: true });

    api.searchFiles(keyword).then(res => {
      const results = (res.data || []).map(item => ({
        ...item,
        categoryName: CATEGORY_MAP[item.category] || item.category,
        icon: this._getFileIcon(item.name),
        formattedTime: this._formatTime(item.createTime)
      }));
      this.setData({ searchResults: results, isSearching: false });
    }).catch(err => {
      console.error('搜索失败:', err);
      this.setData({ isSearching: false });
      wx.showToast({ title: '搜索失败', icon: 'none' });
    });
  },

  clearSearch() { this.setData({ searchKeyword: '', searchResults: [], hasSearched: false }); },

  goToResult(e) {
    const { category, fileid } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/list/list?category=${category}&highlight=${fileid}` });
  },

  _getFileIcon(fileName) {
    if (!fileName || typeof fileName !== 'string') return '📄';
    const parts = fileName.trim().split('.');
    if (parts.length < 2) return '📄';
    const ext = parts[parts.length - 1].toLowerCase();
    if (['mp4', 'mov'].includes(ext)) return '🎬';
    if (['mp3', 'm4a', 'wav'].includes(ext)) return '🎵';
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(ext)) return '🖼️';
    return '📄';
  },

  _formatTime(dateObj) {
    if (!dateObj) return '未知时间';
    const d = new Date(dateObj);
    const pad = n => n < 10 ? '0' + n : n;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  onShareAppMessage() { return { title: '四分部资料大全', path: '/pages/index/index' }; }
});
