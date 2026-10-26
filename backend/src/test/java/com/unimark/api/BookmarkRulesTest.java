package com.unimark.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class BookmarkRulesTest {
    @Test
    void acceptsOnlyHttpAndHttpsUrlsWithoutCredentials() {
        assertEquals("https://example.com/path", BookmarkService.validateUrl(" https://example.com/path "));
        assertThrows(ApiException.class, () -> BookmarkService.validateUrl("javascript:alert(1)"));
        assertThrows(ApiException.class, () -> BookmarkService.validateUrl("https://user:pass@example.com"));
    }

    @Test
    void derivesKnownPlatformsFromTheUrlHost() {
        assertEquals("tiktok", BookmarkService.sourcePlatform("https://www.tiktok.com/@user/video/1"));
        assertEquals("instagram", BookmarkService.sourcePlatform("https://instagram.com/reel/abc"));
        assertEquals("youtube", BookmarkService.sourcePlatform("https://youtu.be/abc123"));
        assertEquals("youtube", BookmarkService.sourcePlatform("https://youtube.com/shorts/abc123"));
        assertEquals("reddit", BookmarkService.sourcePlatform("https://www.reddit.com/r/java"));
        assertEquals("x", BookmarkService.sourcePlatform("https://x.com/example/status/123"));
        assertEquals("web", BookmarkService.sourcePlatform("https://share.google/abc"));
    }

    @Test
    void normalizedUrlDropsFragmentAndDefaultPortButPreservesQuery() {
        assertEquals("https://example.com/story?id=1", BookmarkService.normalizeUrl("https://EXAMPLE.com:443/story?id=1#section"));
    }
}
