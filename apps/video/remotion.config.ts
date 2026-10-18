// Remotion CLI settings for the launch film. See https://www.remotion.dev/docs/config
import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setCodec('h264');
// High bitrate and a 4:2:0 pixel format: soft gradients survive H.264 better.
Config.setCrf(14);
Config.setPixelFormat('yuv420p');
Config.setColorSpace('bt709');
Config.setConcurrency(null);
