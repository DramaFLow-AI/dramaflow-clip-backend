import * as wav from 'wav';
import { PassThrough } from 'stream';

/**
 * 封装pcm为标准的wav
 * @param pcmData
 * @param channels
 * @param rate
 * @param sampleWidth
 */
export function pcmToWavBuffer(
  pcmData: Buffer,
  channels = 1,
  rate = 24000,
  sampleWidth = 2,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const outStream = new PassThrough();
    const writer = new wav.Writer({
      channels,
      sampleRate: rate,
      bitDepth: sampleWidth * 8,
    });

    const chunks: Buffer[] = [];

    outStream.on('data', (chunk) => chunks.push(chunk));
    outStream.on('finish', () => resolve(Buffer.concat(chunks)));
    outStream.on('error', reject);

    writer.pipe(outStream);
    writer.write(pcmData);
    writer.end();
  });
}
