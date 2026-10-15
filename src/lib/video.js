// Uploaded video limits and preparation. Mirrors the `videos` storage bucket in the
// 20261017120000 migration (50 MB = Supabase Free plan's per-file cap).
//
// Phone videos are big (a minute of 1080p is often 100+ MB), so before upload we
// re-encode in the browser to at most 720p H.264/AAC MP4 (~20 MB per minute) using
// WebCodecs via mediabunny, loaded on demand. If the browser can't, the original is
// uploaded as long as it is within the limits.

export const MAX_VIDEO_SECONDS = 60;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const ACCEPTED_VIDEO_TYPES = 'video/mp4,video/quicktime,video/webm';
const EXTENSIONS = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };
const MAX_DIMENSION = 1280;   // longest side after compression (720p)
const VIDEO_BITRATE = 2_500_000;
const AUDIO_BITRATE = 128_000;

export function videoExtension(mimeType) {
  return EXTENSIONS[mimeType];
}

// Error message for a video that can never be accepted, else null. `seconds` may be
// null when the browser could not read the duration.
export function validateVideo({ name, type, size }, seconds, { compressible = false } = {}) {
  if (!EXTENSIONS[type]) {
    return `${name}: only MP4, MOV and WebM videos are supported.`;
  }
  if (seconds != null && seconds > MAX_VIDEO_SECONDS + 0.5) {
    return `${name}: videos can be up to ${MAX_VIDEO_SECONDS} seconds long (this one is ${Math.round(seconds)}s).`;
  }
  if (!compressible && size > MAX_VIDEO_BYTES) {
    return `${name}: videos must be 50 MB or smaller.`;
  }
  return null;
}

// Output size that fits within MAX_DIMENSION, keeping the aspect ratio (even numbers,
// as H.264 requires).
export function targetSize(width, height) {
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const even = (n) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}

// Duration in seconds read from the file's metadata (browser only), or null.
export function readDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const done = (value) => { URL.revokeObjectURL(url); resolve(value); };
    video.preload = 'metadata';
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

// Returns { file } ready to upload (compressed when possible) or { error }.
// `onProgress(0..1)` reports compression progress.
export async function prepareVideo(file, onProgress = () => {}) {
  const seconds = await readDuration(file);
  const early = validateVideo(file, seconds, { compressible: true });
  if (early) return { error: early };

  let result = file;
  try {
    const compressed = await compressVideo(file, onProgress);
    if (compressed && compressed.size < file.size) result = compressed;
  }
  catch (err) {
    console.warn('Video compression failed, uploading the original', err);
  }
  const error = validateVideo(result, seconds);
  return error ? { error: result === file && file.size > MAX_VIDEO_BYTES
    ? `${file.name}: this video is too large and your browser can't shrink it. Try a shorter clip.`
    : error } : { file: result };
}

async function compressVideo(file, onProgress) {
  if (typeof VideoEncoder === 'undefined') return null;
  const {
    Input, Output, Conversion, BlobSource, BufferTarget, Mp4OutputFormat, ALL_FORMATS, canEncodeVideo,
  } = await import('mediabunny');
  if (!(await canEncodeVideo('avc'))) return null;

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const conversion = await Conversion.init({
    input,
    output,
    video: (track) => ({
      ...targetSize(track.displayWidth, track.displayHeight),
      fit: 'contain',
      codec: 'avc',
      bitrate: VIDEO_BITRATE,
      forceTranscode: true,
    }),
    audio: { codec: 'aac', bitrate: AUDIO_BITRATE },
  });
  if (!conversion.isValid) return null;
  conversion.onProgress = (p) => onProgress(p);
  await conversion.execute();
  const name = file.name.replace(/\.[^.]+$/, '') + '.mp4';
  return new File([output.target.buffer], name, { type: 'video/mp4' });
}
