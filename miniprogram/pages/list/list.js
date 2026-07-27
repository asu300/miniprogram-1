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

Page({
  data: {
    categoryName: '',
    fileList: [],
    isAdmin: false,
    categoryKey: '',
    tapCount: 0
  },
  _isProcessing: false,

  // ========== 【核心修复1】增强 loadFiles：分批加载所有记录 + 注入 icon ==========
  loadFiles(category) {
    console.log('[🔍 List查询] 接收到的 category 参数:', JSON.stringify(category));

    wx.showLoading({ title: '加载中...' });
    const db = wx.cloud.database();
    const batchSize = 20;
    let allData = [];

    const fetchBatch = (skip) => {
      db.collection('files')
        .where({ category: category })
        .skip(skip)
        .limit(batchSize)
        .get()
        .then(res => {
          allData = allData.concat(res.data);
          if (res.data.length < batchSize) {
            // 已取完所有数据
            wx.hideLoading();
            const processed = allData.map(item => ({
              ...item,
              formattedTime: this.formatTime(item.createTime),
              icon: this.getFileIcon(item.name)
            }));
            const sortedList = this._sortFiles(processed);
            console.log(`[📥 加载完成] 总计:${allData.length} | 置顶:${sortedList.filter(f=>f.isTop).length}`);
            this.setData({ fileList: sortedList });

            if (this.data.highlightFileID) {
              this._highlightFile(this.data.highlightFileID);
            }
          } else {
            fetchBatch(skip + batchSize);
          }
        })
        .catch(err => {
          wx.hideLoading();
          console.error('加载失败:', err);
          wx.showToast({ title: '加载失败', icon: 'none' });
        });
    };

    fetchBatch(0);
  },

  // 🔑 【新增】获取文件类型图标（安全处理空格、大小写、无扩展名）
  getFileIcon(fileName) {
    if (!fileName || typeof fileName !== 'string') return '📄';
    const cleanName = fileName.trim(); // 去除前后空格
    const parts = cleanName.split('.');
    if (parts.length < 2) return '📄'; // 无扩展名
    
    const ext = parts[parts.length - 1].toLowerCase();
    
    if (['mp4', 'mov'].includes(ext)) return '🎬';
    if (['mp3', 'm4a', 'wav'].includes(ext)) return '🎵';
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(ext)) return '🖼️';
    return '📄';
  },

  // 🔑 【核心修复2】智能排序（兼容所有 isTop 格式）
  _sortFiles(rawList) {
    const safeList = rawList.map(item => {
      const isTop = item.isTop === true || item.isTop === 'true' || item.isTop === 1;
      const topOrder = (isTop && typeof item.topOrder === 'number') ? item.topOrder : 9999;
      return { ...item, isTop, topOrder };
    });

    const topFiles = safeList
      .filter(f => f.isTop)
      .sort((a, b) => a.topOrder - b.topOrder)
      .slice(0, 3);

    const normalFiles = safeList
      .filter(f => !f.isTop)
      .sort((a, b) => new Date(b.createTime) - new Date(a.createTime));
    
    return [...topFiles, ...normalFiles];
  },

  // 高亮指定文件（从搜索结果跳转时）
  _highlightFile(fileID) {
    const index = this.data.fileList.findIndex(f => f.fileID === fileID);
    if (index === -1) return;

    const key = `fileList[${index}].isHighlighted`;
    this.setData({ [key]: true });

    setTimeout(() => {
      wx.pageScrollTo({
        selector: `.file-highlighted`,
        offsetTop: -100,
        duration: 300
      });
    }, 300);

    // 3秒后自动取消高亮
    setTimeout(() => {
      this.setData({ [key]: false, highlightFileID: '' });
    }, 3000);
  },

  // 🔑 【核心修复3】toggleTopFile：增加状态校验 + 精准日志 + 操作隔离
  toggleTopFile(e) {
    const id = e.currentTarget.dataset.id;
    const currentIsTopStr = e.currentTarget.dataset.istop;
    const fileName = e.currentTarget.dataset.name;
    
    console.log('\n[🔍 按钮点击详情]');
    console.log('  文件ID:', id);
    console.log('  文件名:', fileName);
    console.log('  WXML传入 isTop(字符串):', `"${currentIsTopStr}"`);
    console.log('  期望操作:', currentIsTopStr === 'true' ? '【取消置顶】' : '【置顶】');
    
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
      console.warn('[⚠️ 文件不存在] 可能已被删除，ID:', id);
      wx.showToast({ title: '文件不存在，请刷新页面', icon: 'none', duration: 2000 });
      return;
    }
    
    const actualIsTopStr = currentFile.isTop ? 'true' : 'false';
    if (actualIsTopStr !== currentIsTopStr) {
      const errorMsg = 
        `状态冲突！\n\n` +
        `按钮传入状态: "${currentIsTopStr}"\n` +
        `文件实际状态: "${actualIsTopStr}"\n\n` +
        `👉 解决方案:\n` +
        `1. 下拉页面刷新列表\n` +
        `2. 检查WXML按钮:\n` +
        `   • 置顶文件应传 data-istop="true"\n` +
        `   • 非置顶文件应传 data-istop="false"`;
      
      console.error(
        `[❌ 严重状态不一致]\n` +
        `文件: ${fileName}\n` +
        `传入: "${currentIsTopStr}" → 将执行: ${currentIsTopStr === 'true' ? '取消置顶' : '置顶'}\n` +
        `实际: "${actualIsTopStr}" (isTop=${currentFile.isTop})\n` +
        `请检查WXML中该按钮的 data-istop 属性值！`
      );
      
      wx.showModal({
        title: '❌ 状态冲突',
        content: errorMsg,
        showCancel: false,
        confirmText: '我知道了'
      });
      return;
    }
    
    const isCurrentlyTop = (currentIsTopStr === 'true');
    const operationName = isCurrentlyTop ? '取消置顶' : '置顶';
    console.log(`[✅ 状态校验通过] 执行操作: ${operationName}`);
    
    this._isProcessing = true;
    wx.showLoading({ title: `${operationName}中...`, mask: true });

    if (isCurrentlyTop) {
      this._updateDB(id, false, 0)
        .then(() => {
          wx.hideLoading();
          wx.showToast({ 
            title: `✅ "${fileName}" 已取消置顶`, 
            icon: 'success', 
            duration: 1800 
          });
          this.loadFiles(this.data.categoryKey);
        })
        .catch(err => this._handleDBError(err, '取消置顶', fileName))
        .finally(() => { this._isProcessing = false; });
      return;
    }
    
    wx.cloud.database().collection('files')
      .where({ category: this.data.categoryKey, isTop: true })
      .count()
      .then(res => {
        if (res.total >= 3) {
          wx.hideLoading();
          wx.showToast({ 
            title: `⚠️ 该分类已有${res.total}个置顶文件（最多3个）`, 
            icon: 'none', 
            duration: 2500 
          });
          this._isProcessing = false;
          return;
        }
        
        this._updateDB(id, true, res.total + 1)
          .then(() => {
            wx.hideLoading();
            wx.showToast({ 
              title: `✅ "${fileName}" 已置顶`, 
              icon: 'success', 
              duration: 1800 
            });
            this.loadFiles(this.data.categoryKey);
          })
          .catch(err => this._handleDBError(err, '置顶', fileName))
          .finally(() => { this._isProcessing = false; });
      })
      .catch(err => {
        wx.hideLoading();
        console.error('[❌ 置顶数量校验失败]', err);
        wx.showToast({ title: '操作异常', icon: 'none' });
        this._isProcessing = false;
      });
  },

  // 🔑 【核心修复4】数据库更新（严格校验）
  _updateDB(id, isTop, topOrder) {
    return new Promise((resolve, reject) => {
      wx.cloud.database().collection('files').doc(id).update({
        data: { 
          isTop: isTop,
          topOrder: topOrder
        }
      }).then(res => {
        if (!res.stats || res.stats.updated !== 1) {
          reject(new Error(`更新失败 (updated: ${res.stats?.updated || 0})`));
          return;
        }
        console.log(`[✅ DB更新成功] ID:${id} | isTop:${isTop} | topOrder:${topOrder}`);
        resolve();
      }).catch(err => {
        console.error('[❌ DB更新失败]', { id, isTop, topOrder, errMsg: err.message });
        reject(err);
      });
    });
  },

  // 🔑 【核心修复5】精准错误处理
  _handleDBError(err, operation, fileName) {
    wx.hideLoading();
    const msg = (err.message || '').toLowerCase();
    
    if (/permission|权限|denied|auth/i.test(msg)) {
      wx.showModal({
        title: '❌ 数据库权限错误',
        content: `【${operation} "${fileName}" 失败】\n\n` +
                 `必须设置：\n` +
                 `云开发控制台 → 数据库 → files集合 → 权限设置 → "所有用户可读写"`,
        showCancel: false,
        confirmText: '去设置',
        success: () => {
          wx.setClipboardData({ data: '云开发控制台 → 数据库 → files集合 → 权限设置' });
        }
      });
      return;
    }
    
    if (/document.*not found|不存在/i.test(msg)) {
      wx.showToast({ title: `❌ "${fileName}" 已被删除`, icon: 'none', duration: 2500 });
      this.loadFiles(this.data.categoryKey);
      return;
    }
    
    wx.showToast({ title: `${operation} "${fileName}" 失败`, icon: 'none', duration: 2500 });
    console.warn(`[⚠️ ${operation}失败]`, msg);
  },

  // ========== 【关键修复】强化 onLoad 参数校验 ==========
  onLoad(options) {
    const category = options?.category;
    if (!category || typeof category !== 'string' || !CATEGORY_MAP[category]) {
      console.error('[❌ List页面] 无效或缺失 category 参数:', options);
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
    if (this.data.categoryKey) {
      this.loadFiles(this.data.categoryKey);
    }
  },

  isPPT(fileName) {
    if (!fileName) return false;
    var parts = fileName.split('.');
    if (parts.length < 2) return false;
    var ext = parts[parts.length - 1].toLowerCase();
    return ext === 'ppt' || ext === 'pptx';
  },

  formatTime(dateObj) {
    if (!dateObj) return '未知时间';
    var date = new Date(dateObj);
    var y = date.getFullYear();
    var m = this.pad(date.getMonth() + 1);
    var d = this.pad(date.getDate());
    var h = this.pad(date.getHours());
    var min = this.pad(date.getMinutes());
    return y + '-' + m + '-' + d + ' ' + h + ':' + min;
  },

  pad(n) {
    return n < 10 ? '0' + n : n;
  },

  // 🔥🔥🔥【增强版】支持音视频播放 + 音频可控停止
  previewFile(e) {
    const fileID = e.currentTarget.dataset.fileid;
    if (!fileID) {
      wx.showToast({ title: '文件信息错误', icon: 'none' });
      return;
    }

    let fileName = '';
    for (let i = 0; i < this.data.fileList.length; i++) {
      if (this.data.fileList[i].fileID === fileID) {
        fileName = this.data.fileList[i].name;
        break;
      }
    }
    if (!fileName) {
      wx.showToast({ title: '文件名缺失', icon: 'none' });
      return;
    }

    // 获取临时链接
    wx.showLoading({ title: '加载文件...' });
    wx.cloud.getTempFileURL({
      fileList: [{ fileID, maxAge: 7200 }]
    }).then(res => {
      console.log('[🔗 getTempFileURL 结果]', JSON.stringify(res.fileList));
      const fileRes = res.fileList && res.fileList[0];
      if (!fileRes || fileRes.status !== 0) {
        const errMsg = fileRes ? (fileRes.errMsg || 'status=' + fileRes.status) : '结果为空';
        throw new Error('获取临时链接失败: ' + errMsg);
      }
      const tempUrl = fileRes.tempFileURL;
      const ext = fileName.split('.').pop()?.toLowerCase();

      // 🎬 视频播放 (mp4/mov)
      if (['mp4', 'mov'].includes(ext)) {
        wx.hideLoading();
        wx.previewMedia({
          sources: [{
            url: tempUrl,
            type: 'video',
            poster: ''
          }]
        });
        return;
      }

      // 🎵 音频播放 (mp3/m4a/wav) —— 增强版
      if (['mp3', 'm4a', 'wav'].includes(ext)) {
        wx.hideLoading();

        // 如果已有音频在播放，先停止
        if (this.audioCtx) {
          this.audioCtx.stop();
          this.audioCtx.destroy();
          this.audioCtx = null;
        }

        // 创建新的音频上下文
        const audio = wx.createInnerAudioContext();
        this.audioCtx = audio;
        audio.src = tempUrl;
        audio.play();

        // 弹出控制模态框
        wx.showModal({
          title: '🎵 音频播放中',
          content: `正在播放：\n${fileName}`,
          showCancel: true,
          cancelText: '停止',
          confirmText: '最小化',
          success: (res) => {
            if (res.cancel) {
              // 用户点击“停止”
              if (this.audioCtx === audio) {
                this.audioCtx.stop();
                this.audioCtx.destroy();
                this.audioCtx = null;
              }
            }
          }
        });

        // 监听播放结束
        audio.onEnded(() => {
          if (this.audioCtx === audio) {
            this.audioCtx = null;
          }
          audio.destroy();
        });

        // 监听播放错误
        audio.onError((err) => {
          console.error('音频播放失败:', err);
          wx.showToast({ title: '音频播放失败', icon: 'error' });
          if (this.audioCtx === audio) {
            this.audioCtx = null;
          }
          audio.destroy();
        });

        return;
      }

      // 🖼️ 图片预览
      const imgExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp'];
      if (imgExts.includes(ext)) {
        wx.hideLoading();
        wx.previewImage({
          urls: [tempUrl],
          current: tempUrl
        });
        return;
      }

      // 📄 其他文档（PDF/Word/PPT等）
      wx.downloadFile({
        url: tempUrl,
        success: dRes => {
          console.log('[📄 downloadFile 成功]', dRes.statusCode, dRes.tempFilePath);
          if (dRes.statusCode === 200) {
            wx.openDocument({
              filePath: dRes.tempFilePath,
              showMenu: true,
              success: () => wx.hideLoading(),
              fail: (err) => {
                wx.hideLoading();
                console.error('[📄 openDocument 失败]', err);
                wx.showToast({
                  title: this.isPPT(fileName) ? '请安装 WPS 或 PowerPoint' : '无法预览此文件',
                  icon: 'none',
                  duration: 3000
                });
              }
            });
          } else {
            wx.hideLoading();
            console.error('[📄 downloadFile 状态码异常]', dRes.statusCode);
            wx.showToast({ title: '下载失败(' + dRes.statusCode + ')', icon: 'none' });
          }
        },
        fail: (err) => {
          wx.hideLoading();
          console.error('[📄 downloadFile 失败]', err);
          wx.showToast({ title: '文件下载失败，请检查网络', icon: 'none', duration: 3000 });
        }
      });
    }).catch(err => {
      wx.hideLoading();
      console.error('文件预览失败:', err);
      wx.showToast({ title: '文件无法访问', icon: 'none' });
    });
  },

  // 以下方法保持不变
  onTitleTap(e) {
    if (e.currentTarget.dataset.action !== 'admin-trigger') return;
    const newCount = this.data.tapCount + 1;
    this.setData({ tapCount: newCount });
    if (newCount === 3) {
      wx.showModal({
        title: '管理员验证',
        content: '',
        editable: true,
        success: res => {
          if (res.confirm && res.content.trim() === '0000') {
            this.setData({ isAdmin: true });
            wx.showToast({ title: '管理模式ON', icon: 'success' });
          } else if (res.confirm) {
            wx.showToast({ title: '密码错误', icon: 'none' });
          }
          this.setData({ tapCount: 0 });
        },
        fail: () => {
          this.setData({ tapCount: 0 });
        }
      });
    }
  },

  renameFile(e) {
    const id = e.currentTarget.dataset.id;
    const oldName = e.currentTarget.dataset.name;
  
    wx.showModal({
      title: '修改文件名',
      content: ' ',
      editable: true,
      inputValue: oldName,
      placeholderText: '请输入新文件名',
      success: (res) => {
        if (res.confirm) {
          const newName = res.content.trim();
          if (!newName) {
            wx.showToast({ title: '文件名不能为空', icon: 'none' });
            return;
          }
          if (newName === oldName) {
            wx.showToast({ title: '文件名未更改', icon: 'none' });
            return;
          }
  
          wx.cloud.database().collection('files').doc(id).update({
            data: { name: newName }
          }).then(() => {
            wx.showToast({ title: '修改成功', icon: 'success' });
            this.loadFiles(this.data.categoryKey);
          }).catch(err => {
            console.error('重命名失败:', err);
            wx.showToast({ title: '修改失败', icon: 'none' });
          });
        }
      }
    });
  },

  deleteFile(e) {
    var id = e.currentTarget.dataset.id;
    var fileID = e.currentTarget.dataset.fileid;
    wx.showModal({
      title: '确认删除？',
      content: '删除后无法恢复',
      success: function(res) {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          wx.cloud.deleteFile({ fileList: [fileID] })
            .then(function() {
              return wx.cloud.database().collection('files').doc(id).remove();
            })
            .then(function() {
              wx.hideLoading();
              wx.showToast({ title: '删除成功', icon: 'success' });
              this.loadFiles(this.data.categoryKey);
            }.bind(this))
            .catch(function() {
              wx.hideLoading();
              wx.showToast({ title: '删除失败', icon: 'none' });
            });
        }
      }.bind(this)
    });
  },

  goBack() {
    wx.navigateBack();
  },

  // ========== 新增：页面卸载时停止音频 ==========
  onUnload() {
    if (this.audioCtx) {
      this.audioCtx.stop();
      this.audioCtx.destroy();
      this.audioCtx = null;
    }
  }
});