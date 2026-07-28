/**
 * API 服务层 — 统一开关：云开发 ↔ 本地服务器
 * useLocalServer = false → 走微信云开发（现有逻辑）
 * useLocalServer = true  → 连 Mini PC 本地服务器
 */
const LOCAL_SERVER = 'http://localhost:3000';
let useLocal = false;
let token = '';

// ─── 存储登录凭证 ──────────────────────────────────────────
function saveToken(t) { token = t; }

// ─── 本地请求封装 ──────────────────────────────────────────
function localReq(method, path, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: LOCAL_SERVER + path,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? 'Bearer ' + token : '',
      },
      success: res => {
        if (res.statusCode === 401) return reject(new Error('未登录'));
        if (res.statusCode >= 400) return reject(new Error(res.data?.error || '请求失败'));
        resolve(res.data);
      },
      fail: reject,
    });
  });
}

// ─── 云请求封装（保持 wx.cloud 风格）─────────────────────────
let cloudDB = null;
function getDB() {
  if (!cloudDB) cloudDB = wx.cloud.database();
  return cloudDB;
}

// ==================== 文件 API ====================

/** 按分类获取文件列表 */
function getFiles(category) {
  if (useLocal) {
    return localReq('GET', '/api/files?category=' + encodeURIComponent(category));
  }
  return new Promise((resolve, reject) => {
    const db = getDB();
    const batchSize = 20;
    let allData = [];
    const fetchBatch = (skip) => {
      db.collection('files')
        .where({ category })
        .skip(skip).limit(batchSize).get()
        .then(res => {
          allData = allData.concat(res.data);
          if (res.data.length < batchSize) resolve({ data: allData });
          else fetchBatch(skip + batchSize);
        })
        .catch(reject);
    };
    fetchBatch(0);
  });
}

/** 获取文件临时链接（预览用） */
function getFileURL(fileID) {
  if (useLocal) {
    // ponytail: 本地直接返回下载链接
    return Promise.resolve({ tempFileURL: LOCAL_SERVER + '/api/files/download/' + fileID });
  }
  return new Promise((resolve, reject) => {
    wx.cloud.getTempFileURL({ fileList: [{ fileID, maxAge: 7200 }] })
      .then(res => {
        const fr = res.fileList?.[0];
        if (!fr || fr.status !== 0) reject(new Error('获取链接失败'));
        else resolve(fr);
      })
      .catch(reject);
  });
}

/** 更新文件（置顶/重命名） */
function updateFile(id, data) {
  if (useLocal) {
    return localReq('PUT', '/api/files/' + id, data);
  }
  return new Promise((resolve, reject) => {
    getDB().collection('files').doc(id).update({ data })
      .then(res => resolve(res))
      .catch(reject);
  });
}

/** 删除文件 */
function deleteFile(id, fileID) {
  if (useLocal) {
    return localReq('DELETE', '/api/files/' + id, { fileID });
  }
  return new Promise((resolve, reject) => {
    wx.cloud.deleteFile({ fileList: [fileID] })
      .then(() => getDB().collection('files').doc(id).remove())
      .then(resolve)
      .catch(reject);
  });
}

/** 按文件名查询文件（AI 页面用） */
function findFileByName(name) {
  if (useLocal) {
    return localReq('GET', '/api/files/find?name=' + encodeURIComponent(name));
  }
  return new Promise((resolve, reject) => {
    getDB().collection('files').where({ name }).limit(1).get()
      .then(res => resolve(res.data?.[0] || null))
      .catch(reject);
  });
}

/** 搜索文件 */
function searchFiles(keyword) {
  if (useLocal) {
    return localReq('GET', '/api/files/search?q=' + encodeURIComponent(keyword));
  }
  return new Promise((resolve, reject) => {
    const db = getDB();
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    db.collection('files')
      .where({ name: db.RegExp({ regexp: escaped, options: 'i' }) })
      .limit(50).get()
      .then(res => resolve(res))
      .catch(reject);
  });
}

// ==================== AI 聊天 API ====================

function askAI(query) {
  if (useLocal) {
    return localReq('POST', '/api/chat', { query });
  }
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({ name: 'difyProxy', data: { query } })
      .then(res => resolve(res.result))
      .catch(reject);
  });
}

// ==================== 练习 API ====================

function getExercises(videoTitle) {
  if (useLocal) {
    const q = videoTitle ? '?videoTitle=' + encodeURIComponent(videoTitle) : '';
    return localReq('GET', '/api/exercises' + q);
  }
  return new Promise((resolve, reject) => {
    const db = getDB();
    const batchSize = 20;
    let allData = [];
    const fetchBatch = (skip) => {
      let query = db.collection('exercises').orderBy('createTime', 'desc');
      if (videoTitle) query = query.where({ videoTitle });
      query.skip(skip).limit(batchSize).get()
        .then(res => {
          allData = allData.concat(res.data);
          if (res.data.length < batchSize) resolve({ data: allData });
          else fetchBatch(skip + batchSize);
        })
        .catch(reject);
    };
    fetchBatch(0);
  });
}

function getExerciseById(id) {
  if (useLocal) {
    return localReq('GET', '/api/exercises/detail?id=' + id);
  }
  return new Promise((resolve, reject) => {
    getDB().collection('exercises').doc(id).get()
      .then(res => resolve(res.data))
      .catch(reject);
  });
}

// ==================== 文件上传 ====================

function uploadFile(tempFilePath, fileName, category) {
  if (useLocal) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: LOCAL_SERVER + '/api/files/upload?category=' + encodeURIComponent(category),
        filePath: tempFilePath,
        name: 'files',
        formData: { category },
        success: res => {
          try { resolve(JSON.parse(res.data)); }
          catch { reject(new Error(res.data)); }
        },
        fail: reject,
      });
    });
  }
  // ponytail: 云上传走原有逻辑，不在此抽象
  return Promise.reject(new Error('请使用 upload.js 原有上传逻辑'));
}

function uploadMultiple(tempFiles, category) {
  if (useLocal) {
    return new Promise((resolve, reject) => {
      let successCount = 0;
      let failCount = 0;
      let index = 0;
      const next = () => {
        if (index >= tempFiles.length) { resolve({ successCount, failCount }); return; }
        const file = tempFiles[index];
        wx.uploadFile({
          url: LOCAL_SERVER + '/api/files/upload?category=' + encodeURIComponent(category),
          filePath: file.path || file.tempFilePath,
          name: 'files',
          formData: { category },
          success: () => successCount++,
          fail: () => failCount++,
          complete: () => { index++; next(); }
        });
      };
      next();
    });
  }
  return Promise.reject(new Error('请使用 upload.js 原有上传逻辑'));
}

// ==================== 登录（仅本地） ====================

function login(phone, code) {
  return localReq('POST', '/api/auth/login', { phone, code });
}

// ==================== 开关 ====================

function setUseLocal(v) { useLocal = v; }
function isUsingLocal() { return useLocal; }

module.exports = {
  setUseLocal, isUsingLocal,
  saveToken,
  LOCAL_SERVER,
  getFiles, getFileURL, updateFile, deleteFile, findFileByName, searchFiles,
  askAI,
  getExercises, getExerciseById,
  uploadFile, uploadMultiple,
  login,
};
