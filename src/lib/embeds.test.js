import { splitLinks, videoEmbed, videoEmbeds } from './embeds';
import { validateImages } from './media';

describe('splitLinks', () => {
  test('separates links from text and drops trailing punctuation', () => {
    expect(splitLinks('See https://example.com/a?b=1. Nice!')).toEqual([
      { type: 'text', value: 'See ' },
      { type: 'link', href: 'https://example.com/a?b=1' },
      { type: 'text', value: '. Nice!' },
    ]);
  });

  test('ignores non-http schemes', () => {
    expect(splitLinks('javascript:alert(1)')).toEqual([{ type: 'text', value: 'javascript:alert(1)' }]);
  });
});

describe('videoEmbed', () => {
  test.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['https://youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['https://vimeo.com/76979871', 'https://player.vimeo.com/video/76979871'],
    ['https://www.tiktok.com/@grower/video/7234567890123456789', 'https://www.tiktok.com/embed/v2/7234567890123456789'],
    ['https://www.instagram.com/reel/Cx1AbC_dE2/', 'https://www.instagram.com/reel/Cx1AbC_dE2/embed'],
  ])('%s embeds as %s', (url, src) => {
    expect(videoEmbed(url).src).toBe(src);
  });

  test.each([
    'https://evil.example/youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=<script>',
    'https://example.com/video.mp4',
  ])('does not embed %s', (url) => {
    expect(videoEmbed(url)).toBeNull();
  });

  test('deduplicates and caps embeds per comment', () => {
    const text = ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://vimeo.com/1', 'https://vimeo.com/2', 'https://vimeo.com/3'].join(' ');
    expect(videoEmbeds(text).map((e) => e.src)).toEqual([
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      'https://player.vimeo.com/video/1',
      'https://player.vimeo.com/video/2',
    ]);
  });
});

describe('validateImages', () => {
  const image = (name, type = 'image/jpeg', size = 1000) => ({ name, type, size });

  test('accepts up to four supported images', () => {
    expect(validateImages([image('a.jpg'), image('b.png', 'image/png')])).toBeNull();
  });

  test('rejects a fifth image, oversized files and unsupported types', () => {
    expect(validateImages([1, 2, 3, 4, 5].map((n) => image(`${n}.jpg`)))).toMatch(/up to 4/);
    expect(validateImages([image('big.jpg', 'image/jpeg', 6 * 1024 * 1024)])).toMatch(/5 MB/);
    expect(validateImages([image('clip.mp4', 'video/mp4')])).toMatch(/only JPEG/);
  });
});
