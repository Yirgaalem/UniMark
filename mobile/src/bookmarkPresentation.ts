import type {Bookmark} from './api/types';

export function sourceLabel(value: string): string {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'TikTok';
    if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'Instagram';
    if (host.endsWith('youtube.com') || host === 'youtu.be') return 'YouTube';
    if (host === 'reddit.com' || host.endsWith('.reddit.com') || host === 'redd.it') return 'Reddit';
    if (host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com')) return 'X';
    return host;
  } catch {
    return 'Web';
  }
}

export function bookmarkSourceLabel(value: string, url?: string): string {
  if (value.toLowerCase() === 'youtube') {
    try {
      if (/\/shorts\//i.test(new URL(url ?? '').pathname)) return 'YouTube Short';
    } catch { /* Keep the regular YouTube label for malformed URLs. */ }
    return 'YouTube';
  }
  const labels: Record<string, string> = {
    tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube',
    reddit: 'Reddit', x: 'X', web: 'Web', unknown: 'Web',
  };
  return labels[value.toLowerCase()] ?? value;
}

export function formatVideoDuration(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainder = wholeSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function isVideoBookmark(bookmark: Bookmark): boolean {
  if (bookmark.contentType === 'video' || bookmark.videoDurationSeconds != null) return true;
  try {
    const url = new URL(bookmark.originalUrl);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    const youtubeHost = host === 'youtube.com' || host.endsWith('.youtube.com');
    return (host === 'youtu.be' && path.length > 1)
      || (youtubeHost && (/^\/watch\b/.test(path) || /^\/(shorts|embed|live)\//.test(path)))
      || ((host === 'instagram.com' || host.endsWith('.instagram.com')) && /^\/(reel|reels)\//.test(path))
      || ((host === 'tiktok.com' || host.endsWith('.tiktok.com')) && (/\/video\//.test(path) || /^\/t\//.test(path)))
      || host === 'v.redd.it';
  } catch {
    return false;
  }
}

export function isShortVideoBookmark(bookmark: Bookmark): boolean {
  if (!isVideoBookmark(bookmark)) return false;
  if (bookmark.videoDurationSeconds != null) return bookmark.videoDurationSeconds < 120;
  try {
    const url = new URL(bookmark.originalUrl);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    return /\/shorts\//.test(path)
      || ((host === 'instagram.com' || host.endsWith('.instagram.com')) && /^\/(reel|reels)\//.test(path))
      || host === 'vm.tiktok.com'
      || ((host === 'tiktok.com' || host.endsWith('.tiktok.com')) && (/\/video\//.test(path) || /^\/t\//.test(path)));
  } catch {
    return false;
  }
}

export function isLongVideoBookmark(bookmark: Bookmark): boolean {
  return isVideoBookmark(bookmark) && !isShortVideoBookmark(bookmark);
}

export function isArticleBookmark(bookmark: Bookmark): boolean {
  return bookmark.contentType === 'article' && !isVideoBookmark(bookmark);
}
