import { exec, spawn } from 'node:child_process';
import { arch, platform } from 'node:os';
import { promisify } from 'node:util';

import type { SpawnOptions } from 'node:child_process';

const execAwait = promisify(exec);

export interface HWVideoCodec {
  name: string;
  codecName: string;
  type: 'software' | 'hardware';
}

export type HWArgs = string[];

export interface HWFFmpegVersion {
  major: number;
  minor: number;
  patch: number;
}

export type HwAccelMethod = 'auto' | 'cuda' | 'vaapi' | 'videotoolbox' | 'qsv' | 'rkmpp' | 'v4l2m2m' | 'opencl' | 'vulkan' | 'amf' | 'jetson';

export class VaapiDeviceSelector {
  private _selectedGpu: string | null = null;

  async getSelectedGpu(): Promise<string> {
    if (this._selectedGpu) {
      return this._selectedGpu;
    }

    const defaultDevice = '/dev/dri/renderD128';

    try {
      const { stdout } = await execAwait('ls /dev/dri');
      const devices = stdout.split('\n').filter((d) => d.startsWith('render'));

      if (devices.length === 0) {
        return defaultDevice;
      }

      if (devices.length === 1) {
        this._selectedGpu = `/dev/dri/${devices[0]}`;
        return this._selectedGpu;
      }

      for (const device of devices) {
        try {
          await execAwait(`vainfo --display drm --device /dev/dri/${device}`);
          this._selectedGpu = `/dev/dri/${device}`;
          return this._selectedGpu;
        } catch {
          // try the next device
        }
      }

      return defaultDevice;
    } catch {
      return defaultDevice;
    }
  }
}

export class FFMpegHardware {
  static readonly VideoCodecLibx264: HWVideoCodec = { name: 'H264 Software', codecName: 'libx264', type: 'software' };
  static readonly VideoCodecNvenc264: HWVideoCodec = { name: 'H264 NVENC', codecName: 'h264_nvenc', type: 'hardware' };
  static readonly VideoCodecQsv264: HWVideoCodec = { name: 'H264 Intel Quick Sync Video (QSV)', codecName: 'h264_qsv', type: 'hardware' };
  static readonly VideoCodecVaapi264: HWVideoCodec = { name: 'H264 VAAPI', codecName: 'h264_vaapi', type: 'hardware' };
  static readonly VideoCodecAmf264: HWVideoCodec = { name: 'H264 AMD AMF', codecName: 'h264_amf', type: 'hardware' };
  static readonly VideoCodecToolbox264: HWVideoCodec = { name: 'H264 VideoToolbox', codecName: 'h264_videotoolbox', type: 'hardware' };
  static readonly VideoCodecOmx264: HWVideoCodec = { name: 'H264 OpenMAX (Raspberry Pi)', codecName: 'h264_omx', type: 'hardware' };
  static readonly VideoCodecRkmpp264: HWVideoCodec = { name: 'H264 Rockchip MPP', codecName: 'h264_rkmpp', type: 'hardware' };
  static readonly VideoCodecJetson264: HWVideoCodec = { name: 'H264 Jetson NVMM', codecName: 'h264_nvmpi', type: 'hardware' };
  static readonly VideoCodecV4L2M2M264: HWVideoCodec = { name: 'H264 V4L2M2M', codecName: 'h264_v4l2m2m', type: 'hardware' };
  static readonly VideoCodecVulkan264: HWVideoCodec = { name: 'H264 Vulkan', codecName: 'h264_vulkan', type: 'hardware' };
  static readonly VideoCodecOpenCL264: HWVideoCodec = { name: 'H264 OpenCL', codecName: 'h264_opencl', type: 'hardware' };

  static readonly VideoCodecLibx265: HWVideoCodec = { name: 'HEVC Software', codecName: 'libx265', type: 'software' };
  static readonly VideoCodecNvenc265: HWVideoCodec = { name: 'HEVC NVENC', codecName: 'hevc_nvenc', type: 'hardware' };
  static readonly VideoCodecQsv265: HWVideoCodec = { name: 'HEVC Intel Quick Sync Video (QSV)', codecName: 'hevc_qsv', type: 'hardware' };
  static readonly VideoCodecVaapi265: HWVideoCodec = { name: 'HEVC VAAPI', codecName: 'hevc_vaapi', type: 'hardware' };
  static readonly VideoCodecAmf265: HWVideoCodec = { name: 'HEVC AMD AMF', codecName: 'hevc_amf', type: 'hardware' };
  static readonly VideoCodecToolbox265: HWVideoCodec = { name: 'HEVC VideoToolbox', codecName: 'hevc_videotoolbox', type: 'hardware' };
  static readonly VideoCodecOmx265: HWVideoCodec = { name: 'HEVC OpenMAX (Raspberry Pi)', codecName: 'hevc_omx', type: 'hardware' };
  static readonly VideoCodecRkmpp265: HWVideoCodec = { name: 'HEVC Rockchip MPP', codecName: 'hevc_rkmpp', type: 'hardware' };
  static readonly VideoCodecJetson265: HWVideoCodec = { name: 'HEVC Jetson NVMM', codecName: 'hevc_nvmpi', type: 'hardware' };
  static readonly VideoCodecV4L2M2M265: HWVideoCodec = { name: 'HEVC V4L2M2M', codecName: 'hevc_v4l2m2m', type: 'hardware' };
  static readonly VideoCodecVulkan265: HWVideoCodec = { name: 'HEVC Vulkan', codecName: 'hevc_vulkan', type: 'hardware' };
  static readonly VideoCodecOpenCL265: HWVideoCodec = { name: 'HEVC OpenCL', codecName: 'hevc_opencl', type: 'hardware' };

  public supportedCodecs: HWVideoCodec[] = [];

  private scalerRegex = /scale=([-0-9]+):([-0-9]+)/;
  private _ffmpegPath: string;
  private _userAgent: string;
  private _vaapiDeviceSelector: VaapiDeviceSelector;
  private _ffmpegVersion: HWFFmpegVersion | null = null;

  static get H264Codecs(): HWVideoCodec[] {
    return [
      FFMpegHardware.VideoCodecNvenc264,
      FFMpegHardware.VideoCodecVaapi264,
      FFMpegHardware.VideoCodecQsv264,
      FFMpegHardware.VideoCodecAmf264,
      FFMpegHardware.VideoCodecToolbox264,
      FFMpegHardware.VideoCodecOmx264,
      FFMpegHardware.VideoCodecRkmpp264,
      FFMpegHardware.VideoCodecJetson264,
      FFMpegHardware.VideoCodecV4L2M2M264,
      FFMpegHardware.VideoCodecVulkan264,
      FFMpegHardware.VideoCodecOpenCL264,
      FFMpegHardware.VideoCodecLibx264,
    ];
  }

  static get H265Codecs(): HWVideoCodec[] {
    return [
      FFMpegHardware.VideoCodecNvenc265,
      FFMpegHardware.VideoCodecVaapi265,
      FFMpegHardware.VideoCodecQsv265,
      FFMpegHardware.VideoCodecAmf265,
      FFMpegHardware.VideoCodecToolbox265,
      FFMpegHardware.VideoCodecOmx265,
      FFMpegHardware.VideoCodecRkmpp265,
      FFMpegHardware.VideoCodecJetson265,
      FFMpegHardware.VideoCodecV4L2M2M265,
      FFMpegHardware.VideoCodecVulkan265,
      FFMpegHardware.VideoCodecOpenCL265,
      FFMpegHardware.VideoCodecLibx265,
    ];
  }

  constructor(_ffmpegPath = 'ffmpeg', userAgent = 'FFmpeg Camera.UI') {
    this._ffmpegPath = _ffmpegPath;
    this._userAgent = userAgent;
    this._vaapiDeviceSelector = new VaapiDeviceSelector();
  }

  public async getFFmpegVersion(): Promise<HWFFmpegVersion> {
    if (this._ffmpegVersion) {
      return this._ffmpegVersion;
    }

    try {
      const { stdout } = await execAwait(`${this._ffmpegPath} -version`);
      const versionMatch = /ffmpeg version (\d+)\.(\d+)\.(\d+)/.exec(stdout);

      if (versionMatch) {
        this._ffmpegVersion = {
          major: parseInt(versionMatch[1], 10),
          minor: parseInt(versionMatch[2], 10),
          patch: parseInt(versionMatch[3], 10),
        };
        return this._ffmpegVersion;
      }

      return { major: 0, minor: 0, patch: 0 };
    } catch {
      return { major: 0, minor: 0, patch: 0 };
    }
  }

  public getSystemCompatibleCodecs(): HWVideoCodec[] {
    const systemArch = arch();
    const systemPlatform = platform();

    let potentialCodecs = [...FFMpegHardware.H264Codecs, ...FFMpegHardware.H265Codecs];

    if (systemPlatform !== 'darwin') {
      potentialCodecs = potentialCodecs.filter((codec) => !codec.codecName.includes('videotoolbox'));
    }

    if (systemPlatform !== 'win32') {
      potentialCodecs = potentialCodecs.filter((codec) => !codec.codecName.includes('amf'));
    }

    if (!(systemPlatform === 'linux' && systemArch === 'arm64')) {
      potentialCodecs = potentialCodecs.filter((codec) => !codec.codecName.includes('nvmpi'));
    }

    if (!(systemPlatform === 'linux' && (systemArch === 'arm' || systemArch === 'arm64'))) {
      potentialCodecs = potentialCodecs.filter((codec) => !codec.codecName.includes('omx'));
    }

    if (!(systemPlatform === 'linux' && (systemArch === 'arm' || systemArch === 'arm64'))) {
      potentialCodecs = potentialCodecs.filter((codec) => !codec.codecName.includes('rkmpp'));
    }

    if (systemArch !== 'x64' && systemArch !== 'ia32') {
      potentialCodecs = potentialCodecs.filter((codec) => !codec.codecName.includes('nvenc') && !codec.codecName.includes('qsv'));
    }

    if (systemPlatform === 'darwin') {
      potentialCodecs = potentialCodecs.filter(
        (codec) => codec.codecName.includes('videotoolbox') || codec.codecName.includes('opencl') || codec.codecName.includes('vulkan'),
      );
    } else if (systemPlatform === 'win32') {
      // nothing to narrow
    } else if (systemPlatform === 'linux') {
      // nothing to narrow
    }

    return potentialCodecs;
  }

  public async detectSupportedCodecsFromList(codecs: HWVideoCodec[]): Promise<void> {
    const supportedCodecs: HWVideoCodec[] = [];

    for (const codec of codecs) {
      const args = await this.createPlatformSpecificProbeArgs(codec);

      try {
        await this.runFFmpeg(args);
        supportedCodecs.push(codec);
      } catch {
        // not supported
      }
    }

    this.supportedCodecs = supportedCodecs;
  }

  public async detectSupportedCodecs(): Promise<void> {
    if (this.supportedCodecs.length > 0) {
      return;
    }

    const supportedCodecs: HWVideoCodec[] = [];

    const potentialCodecs = this.getSystemCompatibleCodecs();

    for (const codec of potentialCodecs) {
      const args = await this.createPlatformSpecificProbeArgs(codec);

      try {
        await this.runFFmpeg(args);
        supportedCodecs.push(codec);
      } catch {
        // not supported
      }
    }

    this.supportedCodecs = supportedCodecs;
  }

  private async createPlatformSpecificProbeArgs(codec: HWVideoCodec): Promise<HWArgs> {
    const method = this.getHardwareMethod(codec);
    const baseArgs: HWArgs = ['-hide_banner', '-v', 'error'];
    const vaapiDevice = await this._vaapiDeviceSelector.getSelectedGpu();

    switch (method) {
      case 'vaapi':
        return [
          ...baseArgs,
          '-hwaccel_flags',
          'allow_profile_mismatch',
          '-init_hw_device',
          `vaapi=va:${vaapiDevice}`,
          '-f',
          'lavfi',
          '-i',
          'testsrc2=size=1280x720',
          '-t',
          '0.1',
          '-vf',
          'format=nv12,hwupload',
          '-c:v',
          codec.codecName,
          '-f',
          'null',
          '-',
        ];

      case 'cuda':
        return [...baseArgs, '-init_hw_device', 'cuda', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720', '-t', '0.1', '-c:v', codec.codecName, '-f', 'null', '-'];

      case 'qsv':
        return [
          ...baseArgs,
          '-init_hw_device',
          `qsv=hw:${vaapiDevice}`,
          '-filter_hw_device',
          'hw',
          '-f',
          'lavfi',
          '-i',
          'testsrc2=size=1280x720',
          '-t',
          '0.1',
          '-vf',
          'format=nv12,hwupload=extra_hw_frames=64',
          '-c:v',
          codec.codecName,
          '-f',
          'null',
          '-',
        ];

      case 'videotoolbox':
        return [...baseArgs, '-f', 'lavfi', '-i', 'testsrc2=size=1280x720', '-t', '0.1', '-c:v', codec.codecName, '-b:v', '2M', '-f', 'null', '-'];

      case 'v4l2m2m':
        return [...baseArgs, '-f', 'lavfi', '-i', 'testsrc2', '-t', '0.1', '-c:v', codec.codecName, '-f', 'null', '-'];

      case 'rkmpp':
        return [...baseArgs, '-f', 'lavfi', '-i', 'testsrc2', '-t', '0.1', '-c:v', codec.codecName, '-f', 'null', '-'];

      case 'vulkan':
        return [...baseArgs, '-init_hw_device', 'vulkan=vk:0', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720', '-t', '0.1', '-c:v', codec.codecName, '-f', 'null', '-'];

      case 'opencl':
        return [...baseArgs, '-init_hw_device', 'opencl', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720', '-t', '0.1', '-c:v', codec.codecName, '-f', 'null', '-'];

      case 'amf':
        return [...baseArgs, '-f', 'lavfi', '-i', 'testsrc2=size=1280x720', '-t', '0.1', '-c:v', codec.codecName, '-f', 'null', '-'];

      default:
        const args = [...baseArgs];
        args.push('-f', 'lavfi', '-i', 'color=c=red:s=1280x720', '-t', '0.1');
        args.push('-c:v', codec.codecName);
        args.push('-f', 'null', '-');
        return args;
    }
  }

  public async setupHardwareDevice(args: HWArgs, codec: HWVideoCodec): Promise<HWArgs> {
    const method = this.getHardwareMethod(codec);
    const vaapiDevice = await this._vaapiDeviceSelector.getSelectedGpu();
    const version = await this.getFFmpegVersion();

    switch (method) {
      case 'cuda':
        args.push('-threads', '1', '-hwaccel_device', '0', '-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda');
        break;

      case 'vaapi':
        args.push('-hwaccel_flags', 'allow_profile_mismatch', '-vaapi_device', vaapiDevice, '-hwaccel', 'vaapi', '-hwaccel_output_format', 'vaapi');
        break;

      case 'qsv':
        args.push('-hwaccel', 'qsv', '-qsv_device', vaapiDevice, '-hwaccel_output_format', 'qsv', '-init_hw_device', `qsv=hw:${vaapiDevice}`, '-filter_hw_device', 'hw');

        if (version.major >= 61) {
          args.push('-bsf:v', 'dump_extra');
        }
        break;

      case 'videotoolbox':
        args.push('-hwaccel', 'videotoolbox', '-hwaccel_output_format', 'videotoolbox_vld');
        break;

      case 'rkmpp':
        args.push('-hwaccel', 'rkmpp', '-hwaccel_output_format', 'drm_prime');
        break;

      case 'v4l2m2m':
        break;

      case 'opencl':
        args.push('-init_hw_device', 'opencl', '-hwaccel', 'opencl', '-hwaccel_output_format', 'opencl');
        break;

      case 'vulkan':
        args.push('-init_hw_device', 'vulkan=vk:0', '-hwaccel', 'vulkan', '-hwaccel_output_format', 'vulkan');
        break;

      case 'amf':
        if (platform() === 'win32') {
          args.push('-hwaccel', 'd3d11va', '-hwaccel_output_format', 'd3d11');
        }
        break;

      default:
        break;
    }

    return args;
  }

  public getCodecSpecificArgs(codec: HWVideoCodec): HWArgs {
    const args: HWArgs = [];
    const method = this.getHardwareMethod(codec);

    args.push('-g', '30');
    args.push('-bf', '0'); // no B-frames, keeps latency low

    switch (method) {
      case 'videotoolbox':
        args.push('-realtime', '1');
        break;

      case 'opencl':
        break;

      case 'vulkan':
        args.push('-quality', 'balanced');
        break;

      case 'vaapi':
        args.push('-rc_mode', 'CQP');
        break;

      case 'cuda':
        args.push('-threads', '1');
        args.push('-rc', 'constqp', '-qp', '23');
        args.push('-preset', 'p2', '-tune', 'll');
        break;

      case 'qsv':
        args.push('-global_quality', '23');
        args.push('-preset', 'medium');
        break;

      case 'amf':
        args.push('-quality', 'balanced');
        args.push('-rc', 'cqp', '-qp_i', '23', '-qp_p', '23');
        break;

      case 'rkmpp':
        args.push('-rc_mode', '1'); // CBR
        break;

      case 'v4l2m2m':
        // most V4L2 implementations prefer CBR over CQP
        args.push('-b:v', '4M');
        break;
    }

    return args;
  }

  public createHardwareFilter(codec: HWVideoCodec, requestedWidth?: number, requestedHeight?: number, keepOnHardware = true, pixelFormat?: string): string | null {
    if (codec.type === 'software') {
      return this.createSoftwareFilter(requestedWidth, requestedHeight, pixelFormat);
    }

    let filterChain = this.createInitialFilter(codec, keepOnHardware);

    if (requestedWidth && requestedHeight) {
      const [targetWidth, targetHeight] = this.calculateOutputDimensions(requestedWidth, requestedHeight);
      filterChain = this.applyScalingFilter(filterChain, codec, targetWidth, targetHeight);
    }

    return this.finalizePipeline(filterChain, codec, keepOnHardware, pixelFormat);
  }

  public createSoftwareFilter(requestedWidth?: number, requestedHeight?: number, pixelFormat?: string): string {
    let filterChain = '';

    if (requestedWidth && requestedHeight) {
      const [targetWidth, targetHeight] = this.calculateOutputDimensions(requestedWidth, requestedHeight);
      filterChain = `scale=${targetWidth}:${targetHeight}`;
    }

    if (pixelFormat) {
      filterChain = filterChain ? `${filterChain},format=${pixelFormat}` : `format=${pixelFormat}`;
    }

    return filterChain;
  }

  public createInitialFilter(codec: HWVideoCodec, keepOnHardware = true): string {
    // the input is already on the hardware from setupHardwareDevice
    if (keepOnHardware) {
      return '';
    }

    const method = this.getHardwareMethod(codec);

    switch (method) {
      case 'videotoolbox':
      case 'vaapi':
        return 'format=nv12,hwupload';
      case 'cuda':
        return 'format=nv12,hwupload_cuda';
      case 'qsv':
        return 'format=nv12,hwupload=extra_hw_frames=64';
      case 'rkmpp':
        return 'format=drm_prime';
      case 'opencl':
        return 'format=nv12,hwupload_opencl';
      case 'vulkan':
        return 'hwupload';
      case 'amf':
        return 'format=nv12,hwupload';
      default:
        return '';
    }
  }

  public applyScalingFilter(currentFilter: string, codec: HWVideoCodec, width: number, height: number): string {
    let scaleTemplate = '';
    const method = this.getHardwareMethod(codec);

    switch (method) {
      case 'videotoolbox':
        scaleTemplate = 'scale_vt=$width:$height';
        break;
      case 'vaapi':
        scaleTemplate = 'scale_vaapi=w=$width:h=$height';
        break;
      case 'cuda':
        scaleTemplate = 'scale_cuda=w=$width:h=$height';
        break;
      case 'qsv':
        scaleTemplate = 'vpp_qsv=w=$width:h=$height';
        break;
      case 'rkmpp':
        scaleTemplate = 'scale_rkrga=w=$width:h=$height:format=yuv420p:force_original_aspect_ratio=0';
        break;
      case 'v4l2m2m':
        scaleTemplate = 'scale=$width:$height';
        break;
      case 'opencl':
        scaleTemplate = 'scale_opencl=w=$width:h=$height';
        break;
      case 'vulkan':
        scaleTemplate = 'scale_vulkan=$width:$height';
        break;
      case 'amf':
        // AMF has no scaling filter of its own
        scaleTemplate = 'scale=$width:$height';
        break;
      case 'jetson':
        scaleTemplate = 'scale_npp=$width:$height';
        break;
      default:
        scaleTemplate = 'scale=$width:$height';
        break;
    }

    const scalingFilter = scaleTemplate.replace('$width', width.toString()).replace('$height', height.toString());

    if (currentFilter.match(this.scalerRegex)) {
      return currentFilter.replace(this.scalerRegex, scalingFilter);
    } else {
      return currentFilter ? `${currentFilter},${scalingFilter}` : scalingFilter;
    }
  }

  public finalizePipeline(currentFilter: string, codec: HWVideoCodec, keepOnHardware: boolean, pixelFormat?: string): string {
    if (keepOnHardware && !pixelFormat) {
      return currentFilter;
    }

    let finalFilter = currentFilter;
    const method = this.getHardwareMethod(codec);
    const formatsNeedingNV12 = ['yuv420p', 'yuvj420p', 'yuv444p', 'yuvj444p'];
    const useGammaEq = false;

    const createFilterPart = (base: string, needsGammaEq: boolean, targetFormat?: string) => {
      let filterPart = base;

      if (needsGammaEq && useGammaEq && base.includes('format=nv12')) {
        filterPart += ',eq=gamma=1.4:gamma_weight=0.5';
      }

      if (targetFormat && targetFormat !== 'nv12') {
        filterPart += `,format=${targetFormat}`;
      }

      return filterPart;
    };

    switch (method) {
      case 'v4l2m2m':
        // V4L2 M2M needs no hwdownload
        if (pixelFormat) {
          finalFilter = finalFilter ? `${finalFilter},format=${pixelFormat}` : `format=${pixelFormat}`;
        }
        break;

      case 'rkmpp':
        if (pixelFormat || !keepOnHardware) {
          const targetFormat = pixelFormat ?? 'yuv420p';
          const filterPart = `hwmap=mode=read,format=${targetFormat}`;
          finalFilter = finalFilter ? `${finalFilter},${filterPart}` : filterPart;
        }
        break;
      case 'vaapi':
      case 'cuda':
      case 'qsv':
      case 'amf':
      case 'videotoolbox':
        if (pixelFormat || !keepOnHardware) {
          const needsNV12 = !pixelFormat || formatsNeedingNV12.includes(pixelFormat);
          let baseFilter = 'hwdownload';

          if (needsNV12) {
            baseFilter += ',format=nv12';
          }

          const filterPart = createFilterPart(baseFilter, pixelFormat === 'yuv420p', pixelFormat);

          finalFilter = finalFilter ? `${finalFilter},${filterPart}` : filterPart;
        }
        break;
      case 'vulkan':
      case 'opencl':
        if (pixelFormat || !keepOnHardware) {
          const targetFormat = pixelFormat ?? 'yuv420p';
          const filterPart = `hwdownload,format=${targetFormat}`;
          finalFilter = finalFilter ? `${finalFilter},${filterPart}` : filterPart;
        }
        break;

      default:
        if (pixelFormat || !keepOnHardware) {
          const targetFormat = pixelFormat ?? 'yuv420p';
          const filterPart = `hwdownload,format=${targetFormat}`;
          finalFilter = finalFilter ? `${finalFilter},${filterPart}` : filterPart;
        }
        break;
    }

    return finalFilter;
  }

  public getHardwareMethod(codec: HWVideoCodec): HwAccelMethod {
    if (codec.codecName.includes('vaapi')) {
      return 'vaapi';
    } else if (codec.codecName.includes('videotoolbox')) {
      return 'videotoolbox';
    } else if (codec.codecName.includes('nvenc') || codec.codecName.includes('nvmpi')) {
      return 'cuda';
    } else if (codec.codecName.includes('qsv')) {
      return 'qsv';
    } else if (codec.codecName.includes('rkmpp')) {
      return 'rkmpp';
    } else if (codec.codecName.includes('v4l2m2m')) {
      return 'v4l2m2m';
    } else if (codec.codecName.includes('opencl')) {
      return 'opencl';
    } else if (codec.codecName.includes('vulkan')) {
      return 'vulkan';
    } else if (codec.codecName.includes('amf')) {
      return 'amf';
    } else if (codec.codecName.includes('jetson')) {
      return 'jetson';
    } else {
      return 'auto';
    }
  }

  private runFFmpeg(args: HWArgs): Promise<void> {
    return new Promise((resolve, reject) => {
      const options: SpawnOptions = {};

      const ffmpeg = spawn(this._ffmpegPath, args, options);
      let stderr = '';

      ffmpeg.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('error', (error) => {
        reject(error);
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(stderr || `FFmpeg exited with code ${code}`);
        }
      });
    });
  }

  private calculateOutputDimensions(targetWidth: number, targetHeight: number): [number, number] {
    // some codecs require even dimensions
    targetWidth += targetWidth % 2;
    targetHeight += targetHeight % 2;

    return [targetWidth, targetHeight];
  }
}
