const api = require('../../services/api');

Page({
  data: {
    messages: [],
    inputValue: '',
    canSend: false,
    isLoading: false,
    conversationId: '',
    statusBarHeight: 0
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: sys.statusBarHeight || 44,
      messages: [{ role: 'assistant', content: '你好！我是 AI 知识库助手，你可以问我关于文件中资料的任何问题。' }]
    });
  },

  parseSegments(text) {
    const segments = [];
    const re = /\[(\d+)\]/g;
    let last = 0, match;
    while ((match = re.exec(text)) !== null) {
      if (match.index > last) segments.push({ t: 'text', v: text.slice(last, match.index) });
      segments.push({ t: 'cite', v: parseInt(match[1], 10) });
      last = re.lastIndex;
    }
    if (last < text.length) segments.push({ t: 'text', v: text.slice(last) });
    return segments;
  },

  onInput(e) {
    const val = e.detail.value;
    this.setData({ inputValue: val, canSend: val.trim().length > 0 });
  },

  sendMessage() {
    const content = this.data.inputValue.trim();
    if (!content || this.data.isLoading) return;

    const userMsg = { role: 'user', content };
    const msgs = [...this.data.messages, userMsg];
    this.setData({ messages: msgs, inputValue: '', canSend: false, isLoading: true });

    api.askAI(content).then(result => {
      if (result.error) {
        wx.showToast({ title: result.error, icon: 'none', duration: 3000 });
        this.setData({
          messages: [...this.data.messages, { role: 'assistant', content: `❌ ${result.error}`, isError: true }],
          isLoading: false
        });
        return;
      }

      const answer = result.answer || '(未获取到回答)';
      const rawSources = result.sources || [];
      const sources = rawSources.map(s =>
        typeof s === 'string' ? { name: s, fileId: '', category: '' } : s
      );

      this.setData({
        messages: [...this.data.messages, {
          role: 'assistant', content: answer, segments: this.parseSegments(answer), sources
        }],
        isLoading: false
      });
    }).catch(err => {
      console.error('[AI 请求失败]', err);
      wx.showToast({ title: '网络异常，请重试', icon: 'none' });
      this.setData({
        messages: [...this.data.messages, { role: 'assistant', content: '❌ 请求失败，请稍后重试', isError: true }],
        isLoading: false
      });
    });
  },

  onCiteTap(e) {
    const idx = e.currentTarget.dataset.idx;
    const query = wx.createSelectorQuery();
    query.select(`#source-${e.target.dataset.msgIndex || 0}`).boundingClientRect();
    query.selectViewport().scrollOffset();
    query.exec(res => {
      if (res[0]) wx.pageScrollTo({ scrollTop: res[0].top + (res[1]?.scrollTop || 0) - 100, duration: 300 });
    });
  },

  openSource(e) {
    const { fileid, name } = e.currentTarget.dataset;
    if (fileid) { this.previewFile(fileid, name); return; }

    wx.showLoading({ title: '查找文件中...' });
    api.findFileByName(name).then(file => {
      wx.hideLoading();
      if (file && file.fileID) this.previewFile(file.fileID, name);
      else wx.showToast({ title: '未找到文件', icon: 'none' });
    }).catch(() => { wx.hideLoading(); wx.showToast({ title: '查找失败', icon: 'none' }); });
  },

  previewFile(fileid, name) {
    wx.showLoading({ title: '打开文件中...' });
    const ext = (name || '').split('.').pop().toLowerCase();
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(ext);

    api.getFileURL(fileid).then(fr => {
      const url = fr.tempFileURL || fr;
      if (!url) { wx.hideLoading(); wx.showToast({ title: '获取文件链接失败', icon: 'none' }); return; }

      if (isImage) { wx.hideLoading(); wx.previewImage({ urls: [url] }); return; }

      wx.downloadFile({
        url,
        success: (d) => { wx.hideLoading(); wx.openDocument({ filePath: d.tempFilePath, showMenu: true }); },
        fail: () => { wx.hideLoading(); wx.showToast({ title: '文件下载失败', icon: 'none' }); }
      });
    }).catch(() => { wx.hideLoading(); wx.showToast({ title: '获取文件链接失败', icon: 'none' }); });
  },

  goBack() { wx.navigateBack(); },

  clearChat() {
    wx.showModal({
      title: '提示', content: '确定清空对话记录？',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            messages: [{ role: 'assistant', content: '你好！我是基于文件库的 AI 助手，你可以问我关于文件中资料的任何问题。' }],
            conversationId: '', canSend: false
          });
        }
      }
    });
  }
});
