// MiniMax TTS API 响应类型
export interface MinimaxTTSResponse {
  data: {
    audio: string; // 返回的音频内容，hex 编码
    status: number; // 音频状态，通常是 2 表示成功
  };
  extra_info: {
    audio_length: number; // 音频时长（单位 ms）
    audio_sample_rate: number; // 采样率
    audio_size: number; // 文件大小（字节数）
    audio_bitrate: number; // 比特率
    word_count: number; // 文字字数
    invisible_character_ratio: number; // 不可见字符占比
    audio_format: string; // 音频格式，如 mp3
    usage_characters: number; // 本次调用消耗的字符数
  };
  trace_id: string; // 请求的唯一追踪 ID
  base_resp: {
    status_code: number; // 0 表示成功，非 0 表示错误
    status_msg: string; // 错误信息（如果有）
  };
}
