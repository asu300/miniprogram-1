const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { fileID } = event;

  // 日志1：收到什么？
  console.log('[DEBUG] 收到请求，fileID:', fileID);

  if (!fileID) {
    console.log('[ERROR] 缺少 fileID');
    return { success: false, message: '缺少 fileID' };
  }

  // 验证 fileID 格式
  if (!fileID.startsWith('cloud://')) {
    console.log('[ERROR] fileID 格式无效，必须以 cloud:// 开头');
    return { success: false, message: 'fileID 格式错误' };
  }

  try {
    console.log('[DEBUG] 准备调用 setFilePermission...');
    
    const result = await cloud.openapi.security.setFilePermission({
      env: cloud.DYNAMIC_CURRENT_ENV,
      fileId: fileID,
      permission: 'READONLY'
    });

    console.log('[SUCCESS] 公开成功，返回:', result);
    return { success: true, message: '文件已公开' };

  } catch (error) {
    console.error('[FATAL] 公开失败，完整错误:', error);
    return {
      success: false,
      message: '公开失败',
      code: error.errCode,
      errMsg: error.errMsg
    };
  }
};