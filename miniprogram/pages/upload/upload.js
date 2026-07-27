Page({
  data: {
    categoryNames: [
      '飞行部重要宣贯',
      '郑州 → 金奈',
      '郑州 → 德里',
      '郑州 → 列日',
      '郑州 → 布达佩斯',
      '郑州 → 班加罗尔',
      '郑州 → 北美',
      'B747 手册',
      '其它重要资料',
      '音视频资料'
    ],
    categoryKeys: [
      'recent_announcement',
      'zhengzhou_jinai',
      'zhengzhou_delhi',
      'zhengzhou_liege',
      'zhengzhou_budapest',
      'zhengzhou_bangalore',
      'zhengzhou_north_america',
      'b747_ops',
      'other_important',
      'media_resources'
    ],
    selectedCategoryIndex: 0,
    
    // 预览状态
    previewVisible: false,
    isMultiSelect: false,
    fileCount: 0,
    previewFileName: '',
    previewFileSize: '',
    previewFiles: [],
    canUpload: false,

    // 文件数据
    fileName: '',
    filePath: '',
    isImage: false,
    selectedFiles: []
  },

  onLoad(options) {
    if (options.category) {
      const idx = this.data.categoryKeys.indexOf(options.category);
      if (idx !== -1) {
        this.setData({ selectedCategoryIndex: idx });
      }
    }
  },

  onCategoryChange(e) {
    this.setData({ selectedCategoryIndex: parseInt(e.detail.value, 10) });
  },

  // 安全格式化文件大小
  formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  },

  // 安全化文件名（保留中文、字母、数字、常见符号）
  safeFileName(name) {
    return name.replace(/[^\w\u4e00-\u9fa5().\-]/g, '_');
  },

  updatePreviewState() {
    const { fileName, filePath, selectedFiles } = this.data;
    
    if (selectedFiles && selectedFiles.length > 0) {
      const previewList = selectedFiles.map(file => ({
        name: file.name,
        sizeText: this.formatFileSize(file.size)
      }));
      
      this.setData({
        previewVisible: true,
        isMultiSelect: true,
        fileCount: selectedFiles.length,
        previewFiles: previewList,
        previewFileName: '',
        previewFileSize: '',
        canUpload: true
      });
      return;
    }
    
    if (fileName && filePath) {
      let sizeText = '0 B';
      try {
        const stat = wx.getFileSystemManager().statSync(filePath);
        sizeText = this.formatFileSize(stat.size);
      } catch (e) {
        console.warn('获取文件大小失败:', e);
      }
      
      this.setData({
        previewVisible: true,
        isMultiSelect: false,
        fileCount: 0,
        previewFileName: fileName,
        previewFileSize: sizeText,
        canUpload: true
      });
      return;
    }
    
    this.setData({
      previewVisible: false,
      canUpload: false
    });
  },

  chooseFile() {
    this.setData({ selectedFiles: [] });
    
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: (res) => {
        const file = res.tempFiles[0];
        if (file.size > 50 * 1024 * 1024) {
          wx.showToast({ title: '文件不能超过50MB', icon: 'none' });
          return;
        }
        
        const extMatch = file.name.match(/\.([^.]+)$/);
        const ext = extMatch ? extMatch[1].toLowerCase() : '';
        const allowed = ['pdf','doc','docx','xls','xlsx','ppt','pptx','jpg','jpeg','png','gif','bmp','mp3','m4a','wav','mp4','mov','txt'];
        
        if (!ext || !allowed.includes(ext)) {
          wx.showToast({ title: '不支持的文件类型', icon: 'none', duration: 2000 });
          return;
        }
        
        this.setData({
          fileName: file.name,
          filePath: file.path,
          isImage: ['jpg','jpeg','png','gif','bmp'].includes(ext)
        });
        this.updatePreviewState();
      },
      fail: () => wx.showToast({ title: '未选择文件', icon: 'none' })
    });
  },

  chooseMultipleFiles() {
    this.setData({ 
      fileName: '', 
      filePath: '', 
      isImage: false,
      selectedFiles: []
    });
    
    wx.chooseMessageFile({
      count: 9,
      type: 'file',
      success: (res) => {
        const validFiles = [];
        const invalidList = [];
        
        res.tempFiles.forEach(file => {
          if (file.size > 50 * 1024 * 1024) {
            invalidList.push(`${file.name} (超50MB)`);
            return;
          }
          
          const extMatch = file.name.match(/\.([^.]+)$/);
          const ext = extMatch ? extMatch[1].toLowerCase() : '';
          const allowed = ['pdf','doc','docx','xls','xlsx','ppt','pptx','jpg','jpeg','png','gif','bmp','mp3','m4a','wav', 'mp4','mov','txt'];
          
          if (!ext || !allowed.includes(ext)) {
            invalidList.push(file.name);
            return;
          }
          
          validFiles.push({
            name: file.name,
            path: file.path,
            isImage: ['jpg','jpeg','png','gif','bmp'].includes(ext),
            size: file.size
          });
        });
        
        if (invalidList.length > 0) {
          const msg = `跳过 ${invalidList.length} 个无效文件:\n${invalidList.slice(0,3).join('\n')}`;
          wx.showModal({
            title: '提示',
            content: msg,
            showCancel: false,
            confirmText: '我知道了'
          });
        }
        
        if (validFiles.length === 0) {
          wx.showToast({ title: '无可上传文件', icon: 'none' });
          return;
        }
        
        this.setData({ selectedFiles: [...validFiles] });
        this.updatePreviewState();
        
        wx.showToast({
          title: `✅ 已选 ${validFiles.length} 个`,
          icon: 'success',
          duration: 1500
        });
      },
      fail: () => wx.showToast({ title: '未选择文件', icon: 'none' })
    });
  },

  chooseImage() {
    this.setData({ selectedFiles: [] });
    
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        try {
          const stat = wx.getFileSystemManager().statSync(tempFilePath);
          if (stat.size > 50 * 1024 * 1024) {
            wx.showToast({ title: '图片不能超过50MB', icon: 'none' });
            return;
          }
        } catch (e) {
          wx.showToast({ title: '图片信息异常', icon: 'none' });
          return;
        }
        
        const timestamp = Date.now();
        const extMatch = tempFilePath.match(/\.([a-z0-9]+)$/i);
        const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
        const safeExt = ['jpg','jpeg','png','gif','bmp'].includes(ext) ? ext : 'jpg';
        const fileName = `image_${timestamp}.${safeExt}`;
        
        this.setData({
          fileName: fileName,
          filePath: tempFilePath,
          isImage: true
        });
        this.updatePreviewState();
      },
      fail: () => wx.showToast({ title: '未选择图片', icon: 'none' })
    });
  },

  uploadFile() {
    if (!this.data.canUpload) {
      wx.showToast({ title: '请先选择文件', icon: 'none' });
      return;
    }

    const { selectedCategoryIndex, categoryKeys, selectedFiles, fileName, filePath, isImage } = this.data;
    const category = categoryKeys[selectedCategoryIndex];

    // 🔑 关键：校验 category 有效性
    if (!category || typeof category !== 'string') {
      console.error('[上传错误] 无效的分类值:', category);
      wx.showToast({ title: '请选择有效分类', icon: 'none' });
      return;
    }

    if (selectedFiles && selectedFiles.length > 0) {
      this.uploadMultipleFiles(category);
      return;
    }

    let saveName = fileName;
    const extMatch = fileName.match(/\.([a-z0-9]+)$/i);
    if (!extMatch && isImage) {
      saveName = `${fileName}.jpg`;
    }

    const safeName = this.safeFileName(saveName);
    const cloudPath = `files/${Date.now()}_${safeName}`;
    wx.showLoading({ title: '上传中...' });

    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success: (uploadRes) => {
        if (!uploadRes.fileID || !uploadRes.fileID.startsWith('cloud://')) {
          wx.hideLoading();
          wx.showToast({ title: '上传异常', icon: 'none' });
          return;
        }

        let fileSize = 0;
        try {
          fileSize = wx.getFileSystemManager().statSync(filePath).size;
        } catch (e) {}

        wx.cloud.database().collection('files').add({
          data: {
            name: saveName,
            fileID: uploadRes.fileID,
            category,
            isImage,
            createTime: new Date(),
            fileSize
          }
        }).then(() => {
          wx.hideLoading();
          wx.showToast({ title: '✅ 上传成功', icon: 'success' });
          // AI 知识库记录（文本提取由后续脚本完成）
          wx.cloud.database().collection('doc_chunks').add({
            data: {
              fileName: saveName,
              fileID: uploadRes.fileID,
              category: category || '',
              content: '',
              createTime: new Date()
            }
          }).catch(err => console.warn('[AI记录]', err));
          setTimeout(() => {
            wx.redirectTo({ url: `/pages/list/list?category=${encodeURIComponent(category)}` });
          }, 1500);
        }).catch(err => {
          wx.hideLoading();
          console.error('[❌ 数据库保存失败]', err);
          if (err.errCode === -503001) {
            wx.showModal({
              title: '❌ 权限异常',
              content: '数据库写入被拒绝\n\n请确认云开发控制台 → files集合 → 权限为“所有用户可读写”',
              showCancel: false
            });
          } else {
            wx.showToast({ title: '⚠️ 保存失败', icon: 'none' });
          }
        });
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('[❌ 上传失败]', err);
        wx.showToast({ title: '❌ 上传失败', icon: 'none' });
      }
    });
  },

  uploadMultipleFiles(category) {
    const files = this.data.selectedFiles;
    let successCount = 0;
    let failCount = 0;
    let currentIndex = 0;
    const total = files.length;

    wx.showLoading({ title: `上传中 0/${total}` });

    const uploadNext = () => {
      if (currentIndex >= total) {
        wx.hideLoading();
        this.showUploadResult(successCount, failCount, category);
        return;
      }

      const file = files[currentIndex];
      let cloudName = file.name;
      if (file.isImage && !/\.\w{3,4}$/.test(file.name)) {
        cloudName = `${file.name}.jpg`;
      }

      const safeName = this.safeFileName(cloudName);
      const cloudPath = `files/${Date.now()}_${currentIndex}_${safeName}`;

      wx.cloud.uploadFile({
        cloudPath,
        filePath: file.path,
        success: (uploadRes) => {
          if (uploadRes.fileID && uploadRes.fileID.startsWith('cloud://')) {
            wx.cloud.database().collection('files').add({
              data: {
                name: cloudName,
                fileID: uploadRes.fileID,
                category,
                isImage: file.isImage,
                createTime: new Date(),
                fileSize: file.size
              }
            }).then(() => {
              successCount++;
              // AI 知识库记录
              wx.cloud.database().collection('doc_chunks').add({
                data: {
                  fileName: cloudName,
                  fileID: uploadRes.fileID,
                  category: category || '',
                  content: '',
                  createTime: new Date()
                }
              }).catch(err => console.warn('[AI记录]', err));
            }).catch(() => {
              failCount++;
            }).finally(() => {
              currentIndex++;
              wx.showLoading({ title: `上传中 ${currentIndex}/${total}` });
              uploadNext();
            });
          } else {
            failCount++;
            currentIndex++;
            uploadNext();
          }
        },
        fail: () => {
          failCount++;
          currentIndex++;
          uploadNext();
        }
      });
    };

    uploadNext();
  },

  showUploadResult(success, fail, category) {
    if (success === 0) {
      wx.showToast({ title: '❌ 全部上传失败', icon: 'error', duration: 2500 });
      return;
    }

    const msg = fail > 0 
      ? `✅ ${success}个成功 | ❌ ${fail}个失败` 
      : `🎉 全部上传成功（${success}个）`;

    wx.showToast({
      title: msg,
      icon: fail > 0 ? 'none' : 'success',
      duration: 3000
    });

    setTimeout(() => {
      wx.redirectTo({ url: `/pages/list/list?category=${encodeURIComponent(category)}` });
    }, 3000);
  }
});