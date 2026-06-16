import { exec, spawn } from 'node:child_process';
import { arch, platform } from 'node:os';
import { promisify } from 'node:util';

import type { SpawnOptions } from 'node:child_process';

const execAwait = promisify(exec);

/**
 * Represents a hardware-accelerated video codec
 */
export interface HWVideoCodec {
  /** User-friendly name of the codec */
  name: string;
  /** FFmpeg codec name */
  codecName: string;
  /** Type of codec (software or hardware) */
  type: 'software' | 'hardware';
}

/** Array of string arguments for FFmpeg */
export type HWArgs = string[];

/** FFmpeg version information */
export interface HWFFmpegVersion {
  major: number;
  minor: number;
  patch: number;
}

/** Hardware acceleration methods supported by FFmpeg */
export type HwAccelMethod = 'auto' | 'cuda' | 'vaapi' | 'videotoolbox' | 'qsv' | 'rkmpp' | 'v4l2m2m' | 'opencl' | 'vulkan' | 'amf' | 'jetson';

/**
 * Class to intelligently select the best VAAPI device
 */
export class VaapiDeviceSelector {
  private _selectedGpu: string | null = null;

  /**
   * Get the best available VAAPI device
   * @returns Path to the VAAPI device
   */
  async getSelectedGpu(): Promise<string> {
    if (this._selectedGpu) {
      return this._selectedGpu;
    }

    // Default device if all else fails
    const defaultDevice = '/dev/dri/renderD128';

    // Check if /dev/dri exists
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

      // Test each device with vainfo
      for (const device of devices) {
        try {
          await execAwait(`vainfo --display drm --device /dev/dri/${device}`);
          this._selectedGpu = `/dev/dri/${device}`;
          return this._selectedGpu;
        } catch {
          // Continue to next device
        }
      }

      return defaultDevice;
    } catch {
      return defaultDevice;
    }
  }
}

/**
 * Class to handle hardware-accelerated video encoding with FFmpeg
 */
export class FFMpegHardware {
  // H.264 Codecs
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

  // H.265 (HEVC) Codecs
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

  /** List of supported hardware codecs on the current system */
  public supportedCodecs: HWVideoCodec[] = [];

  private scalerRegex = /scale=([-0-9]+):([-0-9]+)/;
  private _ffmpegPath: string;
  private _userAgent: string;
  private _vaapiDeviceSelector: VaapiDeviceSelector;
  private _ffmpegVersion: HWFFmpegVersion | null = null;

  /** Get all supported H.264 codecs */
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
      FFMpegHardware.VideoCodecLibx264, // Software fallback
    ];
  }

  /** Get all supported H.265 codecs */
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
      FFMpegHardware.VideoCodecLibx265, // Software fallback
    ];
  }

  /**
   * Create a new FFMpegHardware instance
   * @param _ffmpegPath Path to the FFmpeg executable
   * @param userAgent Custom user agent for FFmpeg requests
   */
  constructor(_ffmpegPath = 'ffmpeg', userAgent = 'FFmpeg Camera.UI') {
    this._ffmpegPath = _ffmpegPath;
    this._userAgent = userAgent;
    this._vaapiDeviceSelector = new VaapiDeviceSelector();
  }

  /**
   * Get FFmpeg version information
   * @returns Version object with major, minor, and patch numbers
   */
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

  /**
   * Filter codecs based on current system architecture and OS
   * @returns Filtered array of codecs that are likely to work on this system
   */
  public getSystemCompatibleCodecs(): HWVideoCodec[] {
    const systemArch = arch();
    const systemPlatform = platform();

    // Start with all codecs
    let potentialCodecs = [...FFMpegHardware.H264Codecs, ...FFMpegHardware.H265Codecs];

    // First, filter out platform-exclusive codecs

    // VideoToolbox is macOS only
    if (systemPlatform !== 'darwin') {
      potentialCodecs = potentialCodecs.filter((codec) => !codec.codecName.includes('videotoolbox'));
    }

    // AMF is Windows only
    if (systemPlatform !== 'win32') {
      potentialCodecs = potentialCodecs.filter((codec) => !codec.codecName.includes('amf'));
    }

    // Jetson is ARM64 Linux only
    if (!(systemPlatform === 'linux' && systemArch === 'arm64')) {
      potentialCodecs = potentialCodecs.filter((codec) => !codec.codecName.includes('nvmpi'));
    }

    // Raspberry Pi OpenMAX is ARM Linux only
    if (!(systemPlatform === 'linux' && (systemArch === 'arm' || systemArch === 'arm64'))) {
      potentialCodecs = potentialCodecs.filter((codec) => !codec.codecName.includes('omx'));
    }

    // Rockchip MPP is ARM Linux only
    if (!(systemPlatform === 'linux' && (systemArch === 'arm' || systemArch === 'arm64'))) {
      potentialCodecs = potentialCodecs.filter((codec) => !codec.codecName.includes('rkmpp'));
    }

    // NVIDIA and Intel QSV are primarily x86/x64 only
    if (systemArch !== 'x64' && systemArch !== 'ia32') {
      potentialCodecs = potentialCodecs.filter((codec) => !codec.codecName.includes('nvenc') && !codec.codecName.includes('qsv'));
    }

    // Now apply platform-specific inclusions
    if (systemPlatform === 'darwin') {
      // macOS supports VideoToolbox, potentially OpenCL and Vulkan
      potentialCodecs = potentialCodecs.filter(
        (codec) => codec.codecName.includes('videotoolbox') || codec.codecName.includes('opencl') || codec.codecName.includes('vulkan'),
      );
    } else if (systemPlatform === 'win32') {
      // Windows typically supports NVIDIA, Intel QSV, AMD AMF, Vulkan, and OpenCL
      // All these codecs should still be in our list after the exclusion phase
    } else if (systemPlatform === 'linux') {
      // Linux supports VAAPI, NVENC (on x64), V4L2M2M, and more
      // We've already filtered platform-specific ones above
    }

    return potentialCodecs;
  }

  /**
   * Initialize hardware acceleration support by testing specific codecs
   * @param codecs List of codecs to test
   */
  public async detectSupportedCodecsFromList(codecs: HWVideoCodec[]): Promise<void> {
    const supportedCodecs: HWVideoCodec[] = [];

    for (const codec of codecs) {
      // Create platform-specific test command
      const args = await this.createPlatformSpecificProbeArgs(codec);

      try {
        // Test if this codec works
        await this.runFFmpeg(args);
        supportedCodecs.push(codec);
      } catch {
        // console.error(`Codec ${codec.name} failed:`, err);
        // Codec not supported, skip
      }
    }

    this.supportedCodecs = supportedCodecs;
  }

  /**
   * Initialize hardware acceleration support by testing available codecs
   */
  public async detectSupportedCodecs(): Promise<void> {
    // Skip detection if we already have results
    if (this.supportedCodecs.length > 0) {
      return;
    }

    const supportedCodecs: HWVideoCodec[] = [];

    // Get pre-filtered list of codecs that might work on this system
    const potentialCodecs = this.getSystemCompatibleCodecs();

    for (const codec of potentialCodecs) {
      // Create platform-specific test command
      const args = await this.createPlatformSpecificProbeArgs(codec);

      try {
        // Test if this codec works
        await this.runFFmpeg(args);
        supportedCodecs.push(codec);
      } catch {
        // Codec not supported, skip
      }
    }

    this.supportedCodecs = supportedCodecs;
  }

  /**
   * Create platform-specific probe arguments for testing codec support
   * @param codec Codec to test
   * @returns FFmpeg arguments for testing
   */
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
        // For AMD AMF (primarily Windows)
        return [...baseArgs, '-f', 'lavfi', '-i', 'testsrc2=size=1280x720', '-t', '0.1', '-c:v', codec.codecName, '-f', 'null', '-'];

      default:
        // Fallback
        const args = [...baseArgs];
        args.push('-f', 'lavfi', '-i', 'color=c=red:s=1280x720', '-t', '0.1');
        args.push('-c:v', codec.codecName);
        args.push('-f', 'null', '-');
        return args;
    }
  }

  /**
   * Set up hardware device initialization arguments
   * @param args Existing FFmpeg arguments
   * @param codec Target codec to set up
   * @returns Updated arguments array
   */
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

        // Add dump_extra bsf for FFmpeg 6.1+
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
        // No special initialization needed
        break;

      case 'opencl':
        args.push('-init_hw_device', 'opencl', '-hwaccel', 'opencl', '-hwaccel_output_format', 'opencl');
        break;

      case 'vulkan':
        args.push('-init_hw_device', 'vulkan=vk:0', '-hwaccel', 'vulkan', '-hwaccel_output_format', 'vulkan');
        break;

      case 'amf':
        // For AMD, usually using d3d11va for hardware decoding and AMF for encoding
        // AMF doesn't need special initialization parameters like VAAPI or QSV do
        if (platform() === 'win32') {
          args.push('-hwaccel', 'd3d11va', '-hwaccel_output_format', 'd3d11');
        }
        break;

      default:
        // Otherwise no initialization needed
        break;
    }

    return args;
  }

  /**
   * Add codec-specific encoding parameters
   * @param codec Target codec
   * @returns Array of FFmpeg arguments for the codec
   */
  public getCodecSpecificArgs(codec: HWVideoCodec): HWArgs {
    const args: HWArgs = [];
    const method = this.getHardwareMethod(codec);

    // Common parameters that help with consistent streaming in HomeKit
    args.push('-g', '30'); // GOP size of 30 (keyframe every 30 frames)
    args.push('-bf', '0'); // Disable B-frames to reduce latency

    switch (method) {
      case 'videotoolbox':
        // For Apple devices (VideoToolbox)
        args.push('-realtime', '1');
        break;

      case 'opencl':
        // OpenCL-specific arguments
        break;

      case 'vulkan':
        // Vulkan-specific arguments
        args.push('-quality', 'balanced');
        break;

      case 'vaapi':
        // VAAPI-specific encoding parameters
        args.push('-rc_mode', 'CQP');
        break;

      case 'cuda':
        // NVENC-specific arguments for good balance of quality/speed
        args.push('-threads', '1');
        args.push('-rc', 'constqp', '-qp', '23');
        args.push('-preset', 'p2', '-tune', 'll');
        break;

      case 'qsv':
        // QSV-specific arguments
        args.push('-global_quality', '23');
        args.push('-preset', 'medium');
        break;

      case 'amf':
        // AMD AMF-specific arguments
        args.push('-quality', 'balanced');
        args.push('-rc', 'cqp', '-qp_i', '23', '-qp_p', '23');
        break;

      case 'rkmpp':
        // Rockchip MPP specific arguments
        args.push('-rc_mode', '1'); // CBR mode
        break;

      case 'v4l2m2m':
        // V4L2 M2M specific arguments
        // Most V4L2 implementations prefer CBR over CQP
        args.push('-b:v', '4M');
        break;
    }

    return args;
  }

  /**
   * Create complete hardware filter chain for scaling and processing
   * @param codec Target codec
   * @param requestedWidth Desired output width
   * @param requestedHeight Desired output height
   * @param keepOnHardware Whether to keep processing on hardware
   * @param pixelFormat Optional specific pixel format for output
   * @returns Complete filter string or null
   */
  public createHardwareFilter(codec: HWVideoCodec, requestedWidth?: number, requestedHeight?: number, keepOnHardware = true, pixelFormat?: string): string | null {
    // Check if this is a software encoder
    if (codec.type === 'software') {
      return this.createSoftwareFilter(requestedWidth, requestedHeight, pixelFormat);
    }

    // The rest of the method remains the same for hardware encoders
    // Build filter chain
    let filterChain = this.createInitialFilter(codec, keepOnHardware);

    // Add scaling filter if needed
    if (requestedWidth && requestedHeight) {
      const [targetWidth, targetHeight] = this.calculateOutputDimensions(requestedWidth, requestedHeight);
      filterChain = this.applyScalingFilter(filterChain, codec, targetWidth, targetHeight);
    }

    // Always use finalizePipeline to handle the download path uniformly
    // If pixelFormat is specified, pass it to get the right format conversion
    return this.finalizePipeline(filterChain, codec, keepOnHardware, pixelFormat);
  }

  /**
   * Create filter chain for software encoders
   * @param requestedWidth Desired output width
   * @param requestedHeight Desired output height
   * @param pixelFormat Optional specific pixel format for output
   * @returns Filter string for software encoding
   */
  public createSoftwareFilter(requestedWidth?: number, requestedHeight?: number, pixelFormat?: string): string {
    let filterChain = '';

    // Add scaling if needed
    if (requestedWidth && requestedHeight) {
      const [targetWidth, targetHeight] = this.calculateOutputDimensions(requestedWidth, requestedHeight);
      filterChain = `scale=${targetWidth}:${targetHeight}`;
    }

    // Add format conversion if needed
    if (pixelFormat) {
      filterChain = filterChain ? `${filterChain},format=${pixelFormat}` : `format=${pixelFormat}`;
    }

    return filterChain;
  }

  /**
   * Get initial filter setup for hardware pipeline
   * @param codec Target codec
   * @param keepOnHardware Whether to keep processing on hardware (true) or use hybrid pipeline (false)
   * @returns Initial filter string
   */
  public createInitialFilter(codec: HWVideoCodec, keepOnHardware = true): string {
    // If keepOnHardware is true, we don't need to add hwupload filters
    // as the input is already on hardware from setupHardwareDevice
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

  /**
   * Apply hardware-specific scaling template
   * @param currentFilter Current filter string
   * @param codec Target codec
   * @param width Target width
   * @param height Target height
   * @returns Updated filter string with hardware-specific scaling
   */
  public applyScalingFilter(currentFilter: string, codec: HWVideoCodec, width: number, height: number): string {
    let scaleTemplate = '';
    const method = this.getHardwareMethod(codec);

    // Select appropriate hardware scaler based on codec
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
        // AMF doesn't have dedicated scaling filter, use standard scale
        scaleTemplate = 'scale=$width:$height';
        break;
      case 'jetson':
        // Jetson-specific scaling filter
        scaleTemplate = 'scale_npp=$width:$height';
        break;
      default:
        scaleTemplate = 'scale=$width:$height';
        break;
    }

    // Replace width and height in template
    const scalingFilter = scaleTemplate.replace('$width', width.toString()).replace('$height', height.toString());

    // Replace existing scale filter or add new one
    if (currentFilter.match(this.scalerRegex)) {
      return currentFilter.replace(this.scalerRegex, scalingFilter);
    } else {
      return currentFilter ? `${currentFilter},${scalingFilter}` : scalingFilter;
    }
  }

  /**
   * Add final filters to bring data back to CPU if needed and handle format conversion
   * @param currentFilter Current filter string
   * @param codec Target codec
   * @param keepOnHardware Whether to keep processing on hardware
   * @param pixelFormat Optional specific pixel format for output
   * @returns Final filter chain
   */
  public finalizePipeline(currentFilter: string, codec: HWVideoCodec, keepOnHardware: boolean, pixelFormat?: string): string {
    // If we want a full hardware pipeline with no pixel format conversion, return as is
    if (keepOnHardware && !pixelFormat) {
      return currentFilter;
    }

    let finalFilter = currentFilter;
    const method = this.getHardwareMethod(codec);
    const formatsNeedingNV12 = ['yuv420p', 'yuvj420p', 'yuv444p', 'yuvj444p'];
    const useGammaEq = false;

    const createFilterPart = (base: string, needsGammaEq: boolean, targetFormat?: string) => {
      let filterPart = base;

      // Add gamma equation if needed and appropriate
      if (needsGammaEq && useGammaEq && base.includes('format=nv12')) {
        filterPart += ',eq=gamma=1.4:gamma_weight=0.5';
      }

      // Add format conversion if needed
      if (targetFormat && targetFormat !== 'nv12') {
        filterPart += `,format=${targetFormat}`;
      }

      return filterPart;
    };

    // Handle each hardware method differently
    switch (method) {
      case 'v4l2m2m':
        // Video4Linux2 M2M API doesn't require hwdownload operations
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

          // Add nv12 format if needed as intermediate step
          if (needsNV12) {
            baseFilter += ',format=nv12';
          }

          // Create full filter part with gamma correction and final format if needed
          const filterPart = createFilterPart(baseFilter, pixelFormat === 'yuv420p', pixelFormat);

          // Combine with existing filter chain
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
        // For any other methods, use a simple approach
        if (pixelFormat || !keepOnHardware) {
          const targetFormat = pixelFormat ?? 'yuv420p';
          const filterPart = `hwdownload,format=${targetFormat}`;
          finalFilter = finalFilter ? `${finalFilter},${filterPart}` : filterPart;
        }
        break;
    }

    return finalFilter;
  }

  /**
   * Determine the hardware acceleration method used by a codec
   * @param codec Target codec
   * @returns Hardware acceleration method
   */
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

  /**
   * Execute FFmpeg with given arguments
   * @param args FFmpeg arguments
   * @returns Promise that resolves when FFmpeg completes successfully
   */
  private runFFmpeg(args: HWArgs): Promise<void> {
    return new Promise((resolve, reject) => {
      const options: SpawnOptions = {};

      // console.log('Running FFmpeg:', this._ffmpegPath, args.join(' '));

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

  /**
   * Calculate output dimensions
   * @param targetWidth Desired output width
   * @param targetHeight Desired output height
   * @returns [width, height] tuple with even dimensions
   */
  private calculateOutputDimensions(targetWidth: number, targetHeight: number): [number, number] {
    // Ensure dimensions are even (required for some codecs)
    targetWidth += targetWidth % 2;
    targetHeight += targetHeight % 2;

    return [targetWidth, targetHeight];
  }
}
