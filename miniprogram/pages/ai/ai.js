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
    // 获取状态栏高度
    const sys = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: sys.statusBarHeight || 44,
      messages: [{
        role: 'assistant',
        content: '你好！我是 AI 知识库助手，你可以问我关于文件中资料的任何问题。'
      }]
    });
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
    this.setData({
      messages: msgs,
      inputValue: '',
      canSend: false,
      isLoading: true
    });

    wx.cloud.callFunction({
      name: 'difyProxy',
      data: {
        query: content,
        conversationId: this.data.conversationId
      }
    }).then(res => {
      const result = res.result || {};
      if (result.error) {
        wx.showToast({ title: result.error, icon: 'none', duration: 3000 });
        this.setData({
          messages: [...this.data.messages, { role: 'assistant', content: `❌ ${result.error}`, isError: true }],
          isLoading: false
        });
        return;
      }
      // 构建回答文本（含来源）
      let answer = result.answer || '(未获取到回答)';
      const sources = result.sources || [];
      if (sources.length > 0) {
        const sourceList = [...new Set(sources)].map(s => '  📄 ' + s).join('\n');
        answer += '\n\n— 参考文档 —\n' + sourceList;
      }
      this.setData({
        messages: [...this.data.messages, { role: 'assistant', content: answer }],
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

  goBack() {
    wx.navigateBack();
  },

  clearChat() {
    wx.showModal({
      title: '提示',
      content: '确定清空对话记录？',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            messages: [{
              role: 'assistant',
              content: '你好！我是基于文件库的 AI 助手，你可以问我关于文件中资料的任何问题。'
            }],
            conversationId: '',
            canSend: false
          });
        }
      }
    });
  }
});
