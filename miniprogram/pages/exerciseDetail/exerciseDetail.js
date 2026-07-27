Page({
  data: {
    exercise: null,
    videoTitle: '',
    exerciseList: [],
    currentIndex: 0,
    showAnswer: false,
    // 音频播放
    audioPlaying: false,
    audioProgress: 0,
    audioDuration: 0,
    audioCurrentTime: '0:00',
    audioTotalTime: '0:00',
    // 录音
    recording: false,
    recorded: false,
    recordDuration: 0,
    recordPlaying: false
  },

  audioCtx: null,
  recordCtx: null,
  myAudioCtx: null,
  recordTimer: null,

  onLoad(options) {
    this._initRecorder();
    if (options.videoTitle) {
      const title = decodeURIComponent(options.videoTitle);
      this.setData({ videoTitle: title });
      this.loadGroup(title);
    } else if (options.id) {
      this.loadSingle(options.id);
    }
  },

  loadGroup(videoTitle) {
    wx.showLoading({ title: '加载中...' });
    const db = wx.cloud.database();
    const batchSize = 20;
    let allData = [];

    const fetchBatch = (skip) => {
      db.collection('exercises')
        .where({ videoTitle: videoTitle })
        .orderBy('createTime', 'asc')
        .skip(skip)
        .limit(batchSize)
        .get()
        .then(res => {
          allData = allData.concat(res.data);
          if (res.data.length < batchSize) {
            wx.hideLoading();
            if (allData.length === 0) {
              wx.showToast({ title: '没有题目', icon: 'none' });
              return;
            }
            this.setData({ exerciseList: allData, currentIndex: 0 });
            this._showExercise(0);
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

  loadSingle(id) {
    wx.showLoading({ title: '加载中...' });
    const db = wx.cloud.database();
    db.collection('exercises').doc(id).get()
      .then(res => {
        wx.hideLoading();
        this.setData({ exercise: res.data, exerciseList: [res.data], currentIndex: 0 });
        if (res.data.fileID) {
          this.initAudio(res.data.fileID);
        }
      })
      .catch(err => {
        wx.hideLoading();
        console.error('加载失败:', err);
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  _showExercise(index) {
    const exercise = this.data.exerciseList[index];
    this.setData({
      exercise,
      currentIndex: index,
      showAnswer: false,
      recorded: false,
      recordDuration: 0,
      recordPlaying: false
    });
    // 停止之前的音频
    if (this.audioCtx) { this.audioCtx.stop(); }
    this.setData({ audioPlaying: false, audioProgress: 0, audioCurrentTime: '0:00' });
    if (exercise.fileID) {
      this.initAudio(exercise.fileID);
    }
  },

  prevExercise() {
    if (this.data.currentIndex > 0) {
      this._showExercise(this.data.currentIndex - 1);
    }
  },

  nextExercise() {
    if (this.data.currentIndex < this.data.exerciseList.length - 1) {
      this._showExercise(this.data.currentIndex + 1);
    }
  },

  // ===== 录音 =====
  _initRecorder() {
    this.recordCtx = wx.getRecorderManager();
    this.recordCtx.onStop((res) => {
      clearInterval(this.recordTimer);
      if (res.duration < 500) {
        wx.showToast({ title: '录音太短', icon: 'none' });
        this.setData({ recording: false });
        return;
      }
      this._createMyAudio(res.tempFilePath);
      this.setData({
        recording: false,
        recorded: true,
        recordDuration: Math.round(res.duration / 1000)
      });
    });
    this.recordCtx.onError((err) => {
      clearInterval(this.recordTimer);
      console.error('录音失败:', err);
      this.setData({ recording: false });
      wx.showToast({ title: '录音失败', icon: 'none' });
    });
  },

  _createMyAudio(src) {
    if (this.myAudioCtx) {
      this.myAudioCtx.stop();
      this.myAudioCtx.destroy();
    }
    const audio = wx.createInnerAudioContext();
    this.myAudioCtx = audio;
    audio.src = src;
    audio.onEnded(() => {
      this.setData({ recordPlaying: false });
    });
  },

  // ===== ATC 音频播放 =====
  initAudio(fileID) {
    wx.cloud.getTempFileURL({ fileList: [fileID] })
      .then(res => {
        const fileRes = res.fileList && res.fileList[0];
        if (!fileRes || fileRes.status !== 0) return;
        this._createAudioCtx(fileRes.tempFileURL);
      })
      .catch(err => {
        console.error('获取音频链接失败:', err);
      });
  },

  _createAudioCtx(src) {
    if (this.audioCtx) {
      this.audioCtx.stop();
      this.audioCtx.destroy();
    }
    const audio = wx.createInnerAudioContext();
    this.audioCtx = audio;
    audio.src = src;

    audio.onCanplay(() => {
      setTimeout(() => {
        if (audio.duration && isFinite(audio.duration)) {
          this.setData({
            audioDuration: audio.duration,
            audioTotalTime: this._formatTime(audio.duration)
          });
        }
      }, 300);
    });

    audio.onTimeUpdate(() => {
      if (audio.duration > 0) {
        this.setData({
          audioProgress: (audio.currentTime / audio.duration) * 100,
          audioCurrentTime: this._formatTime(audio.currentTime)
        });
      }
    });

    audio.onEnded(() => {
      this.setData({ audioPlaying: false, audioProgress: 0, audioCurrentTime: '0:00' });
    });

    audio.onError(err => {
      console.error('音频加载失败:', err);
    });
  },

  toggleAudio() {
    if (!this.audioCtx) return;
    if (this.data.audioPlaying) {
      this.audioCtx.pause();
      this.setData({ audioPlaying: false });
    } else {
      this.audioCtx.play();
      this.setData({ audioPlaying: true });
    }
  },

  replayAudio() {
    if (!this.audioCtx) return;
    this.audioCtx.seek(0);
    this.audioCtx.play();
    this.setData({ audioPlaying: true });
  },

  seekAudio(e) {
    if (!this.audioCtx || !this.data.audioDuration) return;
    const percent = e.detail.value;
    this.audioCtx.seek((percent / 100) * this.data.audioDuration);
  },

  // ===== 录音 =====
  toggleRecord() {
    if (this.data.recording) {
      this.recordCtx.stop();
    } else {
      this.setData({ recorded: false, recordDuration: 0, showAnswer: false });
      this.recordCtx.start({
        duration: 60000,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        format: 'mp3'
      });
      this.setData({ recording: true });
      this.recordTimer = setInterval(() => {
        this.setData({ recordDuration: this.data.recordDuration + 1 });
      }, 1000);
    }
  },

  playMyRecording() {
    if (!this.myAudioCtx) return;
    this.myAudioCtx.play();
    this.setData({ recordPlaying: true });
  },

  stopMyRecording() {
    if (!this.myAudioCtx) return;
    this.myAudioCtx.stop();
    this.setData({ recordPlaying: false });
  },

  // ===== 答案 =====
  showCorrectAnswer() {
    this.setData({ showAnswer: true });
  },

  resetPractice() {
    if (this.myAudioCtx) { this.myAudioCtx.stop(); }
    this.setData({ recorded: false, recordDuration: 0, showAnswer: false, recordPlaying: false });
  },

  _formatTime(seconds) {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  },

  onUnload() {
    if (this.audioCtx) { this.audioCtx.stop(); this.audioCtx.destroy(); }
    if (this.myAudioCtx) { this.myAudioCtx.stop(); this.myAudioCtx.destroy(); }
    clearInterval(this.recordTimer);
  }
});
