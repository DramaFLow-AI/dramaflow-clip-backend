import { sys_tts_task_segment_key } from '@prisma/client';

export interface TtsJobData {
  taskId: string;
  text: string;
  schemeId: number;
  schemeIndex: number;
  segmentKey: sys_tts_task_segment_key;
  voiceName: string;
  provider: string;
}

export interface VideoScript {
  chineseNarration: {
    begin: string;
    middle: string;
    end: string;
  };
  chineseWordCount: string; // 可以是类似 "328字" 的字符串
  combinationLogic: string; // 描述故事逻辑和情绪曲线
  translation: {
    begin: string;
    middle: string;
    end: string;
  };
  planNumber: string; // 方案编号，如 "方案1"
  title: string; // 视频标题
  usedSegment: {
    segUid: string; // 使用片段的 ID 列表，如 "3+6+9+25+32"
    time: string; // 对应每段时间，如 "10秒,17秒,20秒,25秒,15秒"
  };
  videoDurationSeconds: string; // 视频总时长，单位秒，如 "87秒"
}

export interface DownloadContent {
  audioUrl: {
    beginAudioUrl: string;
    endAudioUrl: string;
    middleAudioUrl: string;
  };
  schemeContent: VideoScript;
}
