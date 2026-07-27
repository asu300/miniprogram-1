/**
 * 上传陆空通话练习题到云数据库
 * 用法: 在微信开发者工具中右键此云函数 -> 上传并部署
 * 然后通过小程序页面触发调用
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event) => {
  const { action, quizzes } = event;

  if (action === 'upload') {
    // 批量上传练习题
    // quizzes: [{ title, fileID, fullText, options, correctAnswer, ... }]
    let success = 0;
    let failed = 0;

    for (const quiz of quizzes) {
      try {
        await db.collection('exercises').add({
          data: {
            title: quiz.title || '',
            fileID: quiz.fileID || '',
            fullText: quiz.fullText || '',
            template: quiz.template || quiz.fullText || '',
            blanks: quiz.blanks || [],
            category: 'atc',
            questionType: quiz.questionType || 'fill',
            options: quiz.options || [],
            correctAnswer: quiz.correctAnswer || '',
            difficulty: quiz.difficulty || 2,
            createTime: db.serverDate()
          }
        });
        success++;
      } catch (e) {
        console.error('上传失败:', e);
        failed++;
      }
    }

    return { success, failed, total: quizzes.length };
  }

  if (action === 'list') {
    // 列出所有陆空通话练习
    const res = await db.collection('exercises')
      .where({ category: 'atc' })
      .orderBy('createTime', 'desc')
      .limit(100)
      .get();
    return { data: res.data };
  }

  if (action === 'delete') {
    // 删除所有陆空通话练习
    const res = await db.collection('exercises')
      .where({ category: 'atc' })
      .remove();
    return { deleted: res.stats.removed };
  }

  return { error: 'unknown action' };
};
