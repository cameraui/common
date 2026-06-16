import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import { FFMpegHardware } from './codec-hardware.js';

import type { HwAccelMethod } from './codec-hardware.js';

const execAwait = promisify(exec);

export interface HWAccelOptions {
  targetCodec: 'h264' | 'h265';
  keepOnHardware?: boolean;
  pixelFormat?: string;
  scale?: {
    width: number;
    height: number;
  };
}

export interface FfmpegArgs {
  codec: string;
  hwaccel: HwAccelMethod;
  hwaccelArgs: string[];
  hwaccelFilters: string[];
  hwDeviceArgs: string[];
  supported: boolean;
}

/**
 * Check if FFmpeg supports a specific codec
 * @param codec Codec name to check
 * @param ffmpegPath Path to FFmpeg executable
 * @returns True if codec is supported
 */
export async function doesFfmpegSupportCodec(codec: string, ffmpegPath: string): Promise<boolean> {
  const output = await execAwait(`${ffmpegPath} -codecs`);
  return output.stdout.includes(codec);
}

/**
 * Check if FFmpeg is installed and accessible
 * @param ffmpegPath Path to FFmpeg executable
 * @returns True if FFmpeg is available
 */
export async function isFfmpegInstalled(ffmpegPath: string): Promise<boolean> {
  try {
    await execAwait(`${ffmpegPath} -codecs`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get hardware acceleration information for FFmpeg
 * @param ffmpegPath Path to FFmpeg executable
 * @param options Hardware acceleration options
 * @returns FFmpeg arguments for hardware acceleration
 */
export async function getHwaccelInfo(ffmpegPath: string, options: HWAccelOptions): Promise<FfmpegArgs[]> {
  const { targetCodec = 'h264', keepOnHardware = false, scale, pixelFormat } = options;

  const results: FfmpegArgs[] = [];
  const ffmpeg = new FFMpegHardware(ffmpegPath);
  const preferredCodecs = targetCodec === 'h264' ? FFMpegHardware.H264Codecs : FFMpegHardware.H265Codecs;
  const potentialCodecs = ffmpeg.getSystemCompatibleCodecs().filter((codec) => preferredCodecs.some((pc) => pc.codecName === codec.codecName));

  await ffmpeg.detectSupportedCodecsFromList(potentialCodecs);

  const supportedCodecs = ffmpeg.supportedCodecs;

  for (const codec of supportedCodecs) {
    const hwaccel = ffmpeg.getHardwareMethod(codec);
    const hwaccelArgs = await ffmpeg.setupHardwareDevice([], codec);
    const filter = ffmpeg.createHardwareFilter(codec, scale?.width, scale?.height, keepOnHardware, pixelFormat);
    const hwaccelFilters = filter ? filter.split(',') : [];
    const hwDeviceArgs = ffmpeg.getCodecSpecificArgs(codec);

    results.push({
      codec: codec.codecName,
      hwaccel,
      hwaccelArgs,
      hwaccelFilters,
      hwDeviceArgs,
      supported: codec.type === 'hardware',
    });
  }

  return results;
}
