import {
  bookmarkSourceLabel,
  formatVideoDuration,
  isArticleBookmark,
  isLongVideoBookmark,
  isShortVideoBookmark,
  isVideoBookmark,
  sourceLabel,
} from './bookmarkPresentation';
import type {Bookmark} from './api/types';

function bookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id: 'bookmark-id',
    originalUrl: 'https://example.com/story',
    sourcePlatform: 'web',
    originalTitle: null,
    customTitle: null,
    description: null,
    thumbnailUrl: null,
    videoDurationSeconds: null,
    contentType: 'unknown',
    userNotes: null,
    savedAt: '2026-10-21T12:00:00Z',
    folderIds: [],
    ...overrides,
  };
}

describe('source labels shown on saved-link cards', () => {
  it.each([
    ['tiktok', 'TikTok'],
    ['instagram', 'Instagram'],
    ['youtube', 'YouTube'],
    ['reddit', 'Reddit'],
    ['x', 'X'],
    ['web', 'Web'],
  ])('renders %s as %s', (platform, label) => {
    expect(bookmarkSourceLabel(platform)).toBe(label);
  });

  it('distinguishes YouTube Shorts and regular YouTube videos', () => {
    expect(bookmarkSourceLabel('youtube', 'https://www.youtube.com/shorts/abc')).toBe('YouTube Short');
    expect(bookmarkSourceLabel('youtube', 'https://www.youtube.com/watch?v=abc')).toBe('YouTube');
  });

  it('derives the source for incoming shares from the host', () => {
    expect(sourceLabel('https://www.tiktok.com/@user/video/1')).toBe('TikTok');
    expect(sourceLabel('https://share.google/abc')).toBe('share.google');
    expect(sourceLabel('not a url')).toBe('Web');
  });
});

describe('saved-link content filters', () => {
  it('classifies short-form social videos as short videos', () => {
    const item = bookmark({originalUrl: 'https://www.instagram.com/reel/abc/'});
    expect(isVideoBookmark(item)).toBe(true);
    expect(isShortVideoBookmark(item)).toBe(true);
    expect(isLongVideoBookmark(item)).toBe(false);
  });

  it('uses the 2-minute boundary for duration metadata', () => {
    expect(isShortVideoBookmark(bookmark({contentType: 'video', videoDurationSeconds: 119}))).toBe(true);
    expect(isLongVideoBookmark(bookmark({contentType: 'video', videoDurationSeconds: 120}))).toBe(true);
  });

  it('does not classify article links as videos', () => {
    const item = bookmark({contentType: 'article', originalUrl: 'https://www.reddit.com/r/example/comments/1/'});
    expect(isArticleBookmark(item)).toBe(true);
    expect(isVideoBookmark(item)).toBe(false);
  });

  it('formats video duration for card badges', () => {
    expect(formatVideoDuration(9)).toBe('0:09');
    expect(formatVideoDuration(125)).toBe('2:05');
    expect(formatVideoDuration(3661)).toBe('1:01:01');
  });
});
