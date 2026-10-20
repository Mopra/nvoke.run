// Masters a rendered film's sound for the web: a gentle glue compressor and
// two pass loudness normalization to -14 LUFS, true peak -1 dBTP (what
// YouTube, X and LinkedIn play back at). The picture is copied untouched.
//
//   node scripts/master.mjs out/teaser-studio-raw.mp4 out/teaser-studio.mp4
import { execFileSync, spawnSync } from 'node:child_process';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node scripts/master.mjs <in.mp4> <out.mp4>');
  process.exit(1);
}

const TARGET = 'I=-14:TP=-1:LRA=9';
// Rumble off below 25 Hz, then a slow 2:1 compressor that only rides the loudest hits.
const glue = 'highpass=f=25,acompressor=threshold=-18dB:ratio=2:attack=20:release=250:makeup=1';

// ffmpeg prints the measurement on stderr.
const { stderr } = spawnSync('ffmpeg', ['-hide_banner', '-i', input, '-af', `${glue},loudnorm=${TARGET}:print_format=json`, '-vn', '-f', 'null', '-'], { encoding: 'utf8' });
const json = JSON.parse(/\{[^{}]*"input_i"[^{}]*\}/s.exec(stderr)?.[0] ?? 'null');
if (!json) throw new Error('could not read the loudness measurement');
console.log(`[master] measured ${json.input_i} LUFS, peak ${json.input_tp} dBTP`);

const second = [
  `measured_I=${json.input_i}`,
  `measured_TP=${json.input_tp}`,
  `measured_LRA=${json.input_lra}`,
  `measured_thresh=${json.input_thresh}`,
  `offset=${json.target_offset}`,
  'linear=true',
].join(':');
execFileSync(
  'ffmpeg',
  ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-af', `${glue},loudnorm=${TARGET}:${second},aresample=48000`, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-movflags', '+faststart', output],
  { stdio: 'inherit' },
);
console.log(`[master] wrote ${output}`);
