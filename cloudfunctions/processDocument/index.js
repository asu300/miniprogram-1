const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { fileID, fileName, category } = event;

  await db.collection('doc_chunks').add({
    fileName: fileName || '未知',
    fileID: fileID || '',
    category: category || '',
    content: '测试记录',
    createTime: new Date()
  });

  return { success: true, fileID, fileName };
};
