import { MAX_VIDEO_BYTES, targetSize, validateVideo } from './video';

const clip = (overrides = {}) => ({ name: 'clip.mp4', type: 'video/mp4', size: 10 * 1024 * 1024, ...overrides });

describe('validateVideo', () => {
  test('accepts phone formats within the limits', () => {
    expect(validateVideo(clip(), 30)).toBeNull();
    expect(validateVideo(clip({ name: 'IMG_1.MOV', type: 'video/quicktime' }), 59.9)).toBeNull();
  });

  test('rejects other formats and videos over a minute', () => {
    expect(validateVideo(clip({ name: 'a.avi', type: 'video/x-msvideo' }), 10)).toMatch(/only MP4, MOV and WebM/);
    expect(validateVideo(clip(), 75)).toMatch(/up to 60 seconds long \(this one is 75s\)/);
  });

  test('big files are fine before compression but not as the final upload', () => {
    const big = clip({ size: MAX_VIDEO_BYTES + 1 });
    expect(validateVideo(big, 40, { compressible: true })).toBeNull();
    expect(validateVideo(big, 40)).toMatch(/50 MB or smaller/);
  });

  test('an unknown duration is not a reason to reject', () => {
    expect(validateVideo(clip(), null)).toBeNull();
  });
});

describe('targetSize', () => {
  test('scales the longest side down to 1280 and keeps even dimensions', () => {
    expect(targetSize(1920, 1080)).toEqual({ width: 1280, height: 720 });
    expect(targetSize(1080, 1920)).toEqual({ width: 720, height: 1280 });
    expect(targetSize(1081, 1921)).toEqual({ width: 720, height: 1280 });
  });

  test('never upscales small videos', () => {
    expect(targetSize(640, 360)).toEqual({ width: 640, height: 360 });
  });
});
