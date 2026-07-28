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
    categoryName: '',
    fileList: [],
    isAdmin: false,
    categoryKey: '',
    tapCount: 0
  },
  _isProcessing: false,

  loadFiles(category) {
    wx.showLoading({ title: '加载中...' });
    api.getFiles(category).then(res => {
      wx.hideLoading();
      const allData = res.data || [];
      const processed = allData.map(item => ({
        ...item,
        formattedTime: this.formatTime(item.createTime),
        icon: this.getFileIcon(item.name)
      }));
      const sortedList = this._sortFiles(processed);
      this.setData({ fileList: sortedList });
      if (this.data.highlightFileID) this._highlightFile(this.data.highlightFileID);
    }).catch(err => {
      wx.hideLoading();
      console.error('加载失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  getFileIcon(fileName) {
    if (!fileName || typeof fileName !== 'string') return '📄';
    const cleanName = fileName.trim();
    const parts = cleanName.split('.');
    if (parts.length < 2) return '📄';
    const ext = parts[parts.length - 1].toLowerCase();
    if (['mp4', 'mov'].includes(ext)) return '🎬';
    if (['mp3', 'm4a', 'wav'].includes(ext)) return '🎵';
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(ext)) return '🖼️';
    return '📄';
  },

  _sortFiles(rawList) {
    const safeList = rawList.map(item => {
      const isTop = item.isTop === true || item.isTop === 'true' || item.isTop === 1;
      const topOrder = (isTop && typeof item.topOrder === 'number') ? item.topOrder : 9999;
      return { ...item, isTop, topOrder };
    });
    const topFiles = safeList.filter(f => f.isTop).sort((a, b) => a.topOrder - b.topOrder).slice(0, 3);
    const normalFiles = safeList.filter(f => !f.isTop).sort((a, b) => new Date(b.createTime) - new Date(a.createTime));
    return [...topFiles, ...normalFiles];
  },

  _highlightFile(fileID) {
    const index = this.data.fileList.findIndex(f => f.fileID === fileID);
    if (index === -1) return;
    const key = `fileList[${index}].isHighlighted`;
    this.setData({ [key]: true });
    setTimeout(() => {
      wx.pageScrollTo({ selector: `.file-highlighted`, offsetTop: -100, duration: 300 });
    }, 300);
    setTimeout(() => { this.setData({ [key]: false, highlightFileID: '' }); }, 3000);
  },

  toggleTopFile(e) {
    const id = e.currentTarget.dataset.id;
    const currentIsTopStr = e.currentTarget.dataset.istop;
    const fileName = e.currentTarget.dataset.name;

    if (this._isProcessing) {
      wx.showToast({ title: '操作进行中...', icon: 'none', duration: 1000 });
      return;
    }
    if (!id || typeof id !== 'string') {
      wx.showToast({ title: '文件ID异常', icon: 'none' });
      return;
    }

    const currentFile = this.data.fileList.find(f => f._id === id);
    if (!currentFile) {
      wx.showToast({ title: '文件不存在，请刷新页面', icon: 'none', duration: 2000 });
      return;
    }

    const actualIsTopStr = currentFile.isTop ? 'true' : 'false';
    if (actualIsTopStr !== currentIsTopStr) {
      wx.showModal({
        title: '❌ 状态冲突',
        content: `按钮传入状态: "${currentIsTopStr}"\n文件实际状态: "${actualIsTopStr}"`,
        showCancel: false
      });
      return;
    }

    const isCurrentlyTop = (currentIsTopStr === 'true');
    const operationName = isCurrentlyTop ? '取消置顶' : '置顶';

    this._isProcessing = true;
    wx.showLoading({ title: `${operationName}中...`, mask: true });

    if (isCurrentlyTop) {
      this._updateDB(id, false, 0).then(() => {
        wx.hideLoading();
        wx.showToast({ title: `✅ "${fileName}" 已取消置顶`, icon: 'success', duration: 1800 });
        this.loadFiles(this.data.categoryKey);
      }).catch(err => this._handleDBError(err, '取消置顶', fileName))
        .finally(() => { this._isProcessing = false; });
      return;
    }

    // 置顶：先数已有几个置顶
    api.getFiles(this.data.categoryKey).then(res => {
      const topCount = (res.data || []).filter(f => f.isTop).length;
      if (topCount >= 3) {
        wx.hideLoading();
        wx.showToast({ title: `⚠️ 该分类已有${topCount}个置顶文件（最多3个）`, icon: 'none', duration: 2500 });
        this._isProcessing = false;
        return;
      }
      this._updateDB(id, true, topCount + 1).then(() => {
        wx.hideLoading();
        wx.showToast({ title: `✅ "${fileName}" 已置顶`, icon: 'success', duration: 1800 });
        this.loadFiles(this.data.categoryKey);
      }).catch(err => this._handleDBError(err, '置顶', fileName))
        .finally(() => { this._isProcessing = false; });
    }).catch(() => {
      wx.hideLoading();
      this._isProcessing = false;
    });
  },

  _updateDB(id, isTop, topOrder) {
    return api.updateFile(id, { isTop, topOrder });
  },

  _handleDBError(err, operation, fileName) {
    wx.hideLoading();
    wx.showToast({ title: `${operation} "${fileName}" 失败`, icon: 'none', duration: 2500 });
    console.warn(`[⚠️ ${operation}失败]`, err.message);
  },

  onLoad(options) {
    const category = options?.category;
    if (!category || typeof category !== 'string' || !CATEGORY_MAP[category]) {
      wx.showToast({ title: '无效分类', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    const categoryName = CATEGORY_MAP[category];
    const highlightFileID = options?.highlight || '';
    this.setData({ categoryName, categoryKey: category, highlightFileID });
    this.loadFiles(category);
  },

  onShow() {
    if (this.data.categoryKey) this.loadFiles(this.data.categoryKey);
  },

  isPPT(fileName) {
    if (!fileName) return false;
    const parts = fileName.split('.');
    if (parts.length < 2) return false;
    return ['ppt', 'pptx'].includes(parts[parts.length - 1].toLowerCase());
  },

  formatTime(dateObj) {
    if (!dateObj) return '未知时间';
    const date = new Date(dateObj);
    const pad = n => n < 10 ? '0' + n : n;
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  },

  previewFile(e) {
    const fileID = e.currentTarget.dataset.fileid;
    const docID = e.currentTarget.dataset.id;
    if (!fileID) { wx.showToast({ title: '文件信息错误', icon: 'none' }); return; }

    let fileName = '';
    for (const f of this.data.fileList) {
      if (f.fileID === fileID) { fileName = f.name; break; }
    }
    if (!fileName) { wx.showToast({ title: '文件名缺失', icon: 'none' }); return; }

    wx.showLoading({ title: '加载文件...' });
    api.getFileURL(fileID, docID).then(fr => {
      const tempUrl = fr.tempFileURL || fr;
      const ext = fileName.split('.').pop()?.toLowerCase();

      if (['mp4', 'mov'].includes(ext)) {
        wx.hideLoading();
        wx.previewMedia({ sources: [{ url: tempUrl, type: 'video' }] });
        return;
      }

      if (['mp3', 'm4a', 'wav'].includes(ext)) {
        wx.hideLoading();
        if (this.audioCtx) { this.audioCtx.stop(); this.audioCtx.destroy(); }
        const audio = wx.createInnerAudioContext();
        this.audioCtx = audio;
        audio.src = tempUrl;
        audio.play();
        wx.showModal({
          title: '🎵 音频播放中',
          content: `正在播放：\n${fileName}`,
          showCancel: true, cancelText: '停止', confirmText: '最小化',
          success: (res) => {
            if (res.cancel && this.audioCtx === audio) {
              this.audioCtx.stop(); this.audioCtx.destroy(); this.audioCtx = null;
            }
          }
        });
        audio.onEnded(() => { if (this.audioCtx === audio) { this.audioCtx = null; } audio.destroy(); });
        audio.onError(() => { wx.showToast({ title: '音频播放失败', icon: 'error' }); audio.destroy(); });
        return;
      }

      const imgExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp'];
      if (imgExts.includes(ext)) {
        wx.hideLoading();
        wx.previewImage({ urls: [tempUrl] });
        return;
      }

      // 文档类：检查缓存 → 下载并缓存 → 打开
      const cached = api.getCachedPath(fileID);
      if (cached) {
        wx.openDocument({ filePath: cached, showMenu: true, success: () => wx.hideLoading(), fail: () => { wx.hideLoading(); wx.showToast({ title: '无法预览此文件', icon: 'none' }); } });
        return;
      }

      api.downloadAndCache(fileID, tempUrl).then(localPath => {
        wx.openDocument({ filePath: localPath, showMenu: true, success: () => wx.hideLoading(), fail: () => { wx.hideLoading(); wx.showToast({ title: this.isPPT(fileName) ? '请安装 WPS 或 PowerPoint' : '无法预览此文件', icon: 'none', duration: 3000 }); } });
      }).catch(() => {
        // fallback 到临时下载
        wx.downloadFile({
          url: tempUrl,
          success: dRes => {
            if (dRes.statusCode === 200) {
              wx.openDocument({ filePath: dRes.tempFilePath, showMenu: true, success: () => wx.hideLoading(), fail: () => { wx.hideLoading(); wx.showToast({ title: this.isPPT(fileName) ? '请安装 WPS 或 PowerPoint' : '无法预览此文件', icon: 'none', duration: 3000 }); } });
            } else { wx.hideLoading(); wx.showToast({ title: '下载失败', icon: 'none' }); }
          },
          fail: () => { wx.hideLoading(); wx.showToast({ title: '文件下载失败', icon: 'none', duration: 3000 }); }
        });
      });
    }).catch(err => {
      wx.hideLoading();
      console.error('文件预览失败:', err);
      wx.showToast({ title: '文件无法访问', icon: 'none' });
    });
  },

  onTitleTap(e) {
    if (e.currentTarget.dataset.action !== 'admin-trigger') return;
    const newCount = this.data.tapCount + 1;
    this.setData({ tapCount: newCount });
    if (newCount === 3) {
      wx.showModal({
        title: '管理员验证', content: '', editable: true,
        success: res => {
          if (res.confirm && res.content.trim() === '0000') {
            this.setData({ isAdmin: true });
            wx.showToast({ title: '管理模式ON', icon: 'success' });
          } else if (res.confirm) {
            wx.showToast({ title: '密码错误', icon: 'none' });
          }
          this.setData({ tapCount: 0 });
        },
        fail: () => this.setData({ tapCount: 0 })
      });
    }
  },

  renameFile(e) {
    const id = e.currentTarget.dataset.id;
    const oldName = e.currentTarget.dataset.name;
    wx.showModal({
      title: '修改文件名', content: ' ', editable: true, inputValue: oldName, placeholderText: '请输入新文件名',
      success: (res) => {
        if (res.confirm) {
          const newName = res.content.trim();
          if (!newName) { wx.showToast({ title: '文件名不能为空', icon: 'none' }); return; }
          if (newName === oldName) { wx.showToast({ title: '文件名未更改', icon: 'none' }); return; }
          api.updateFile(id, { name: newName }).then(() => {
            wx.showToast({ title: '修改成功', icon: 'success' });
            this.loadFiles(this.data.categoryKey);
          }).catch(err => { console.error('重命名失败:', err); wx.showToast({ title: '修改失败', icon: 'none' }); });
        }
      }
    });
  },

  deleteFile(e) {
    const id = e.currentTarget.dataset.id;
    const fileID = e.currentTarget.dataset.fileid;
    wx.showModal({
      title: '确认删除？', content: '删除后无法恢复',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          api.deleteFile(id, fileID).then(() => {
            wx.hideLoading();
            wx.showToast({ title: '删除成功', icon: 'success' });
            this.loadFiles(this.data.categoryKey);
          }).catch(() => { wx.hideLoading(); wx.showToast({ title: '删除失败', icon: 'none' }); });
        }
      }
    });
  },

  goBack() { wx.navigateBack(); },

  onUnload() {
    if (this.audioCtx) { this.audioCtx.stop(); this.audioCtx.destroy(); }
  }
});
