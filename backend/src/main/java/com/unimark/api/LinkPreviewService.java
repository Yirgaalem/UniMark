package com.unimark.api;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.web.util.HtmlUtils;

/** Fetches a small Open Graph preview for supported social sites. Failures are intentionally non-fatal. */
@Service
public class LinkPreviewService {
    private static final int MAX_HTML_BYTES = 512 * 1024;
    private static final int MAX_REDIRECTS = 3;
    private static final Pattern META_TAG = Pattern.compile("(?is)<meta\\b[^>]*>");
    private static final Pattern ATTRIBUTE = Pattern.compile("(?is)([a-zA-Z_:][-a-zA-Z0-9_:]*)\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))");
    private static final Pattern TITLE_TAG = Pattern.compile("(?is)<title\\b[^>]*>(.*?)</title\\s*>");
    private static final Pattern YOUTUBE_LENGTH_SECONDS = Pattern.compile("(?i)\"lengthSeconds\"\\s*:\\s*\"?(\\d{1,8})\"?");
    private static final Pattern ISO_DURATION = Pattern.compile("(?i)PT(?:(\\d+)H)?(?:(\\d+)M)?(?:(\\d+(?:\\.\\d+)?)S)?");
    private static final Set<String> ALLOWED_PREVIEW_HOSTS = Set.of(
            "youtube.com", "youtu.be", "tiktok.com", "instagram.com", "x.com", "twitter.com",
            "reddit.com", "redd.it", "t.co", "share.google", "google.com");

    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(2))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
    private final ObjectMapper objectMapper;

    public LinkPreviewService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public Preview fetch(String originalUrl) {
        Preview preview = Preview.empty();
        URI current = null;
        try {
            current = safeSocialUri(URI.create(originalUrl));
            for (int redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
                HttpRequest request = HttpRequest.newBuilder(current)
                        .timeout(Duration.ofSeconds(3))
                        .header("User-Agent", "UniMarkLinkPreview/1.0 (+https://unimark.app)")
                        .header("Accept", "text/html,application/xhtml+xml")
                        .GET().build();
                HttpResponse<InputStream> response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
                try (InputStream body = response.body()) {
                    int status = response.statusCode();
                    if (status >= 300 && status < 400) {
                        Optional<String> location = response.headers().firstValue("location");
                        if (location.isEmpty() || redirects == MAX_REDIRECTS) break;
                        current = safeSocialUri(current.resolve(location.get()));
                        continue;
                    }
                    String contentType = response.headers().firstValue("content-type").orElse("").toLowerCase(Locale.ROOT);
                    if (status < 200 || status >= 300 || !contentType.contains("text/html")) break;
                    String html = readLimited(body);
                    preview = parse(html, current);
                    break;
                }
            }
        } catch (Exception ignored) {
            // A preview must never prevent saving the original link.
        }
        return providerFallbacks(originalUrl, current, preview);
    }

    private Preview providerFallbacks(String originalUrl, URI resolvedUri, Preview preview) {
        try {
            URI original = URI.create(originalUrl);
            String host = original.getHost() == null ? "" : original.getHost().toLowerCase(Locale.ROOT);
            String resolvedHost = resolvedUri == null || resolvedUri.getHost() == null ? "" : resolvedUri.getHost().toLowerCase(Locale.ROOT);
            boolean youtube = isHostOrSubdomain(host, "youtube.com") || host.equals("youtu.be")
                    || isHostOrSubdomain(resolvedHost, "youtube.com") || resolvedHost.equals("youtu.be");
            if (youtube) {
                String videoId = youtubeVideoId(original);
                if (videoId == null && resolvedUri != null) videoId = youtubeVideoId(resolvedUri);
                if (videoId == null) return preview;
                String thumbnail = preview.thumbnailUrl() != null ? preview.thumbnailUrl()
                        : "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg";
                String title = preview.title();
                if (title == null || title.equalsIgnoreCase("YouTube")) {
                    JsonNode oEmbed = fetchJson("https://www.youtube.com/oembed?url="
                            + URLEncoder.encode("https://www.youtube.com/watch?v=" + videoId, StandardCharsets.UTF_8)
                            + "&format=json");
                    title = jsonText(oEmbed, "title");
                    if (preview.thumbnailUrl() == null) thumbnail = jsonText(oEmbed, "thumbnail_url") == null
                            ? thumbnail : jsonText(oEmbed, "thumbnail_url");
                }
                return new Preview(title, preview.description(), thumbnail, preview.videoDurationSeconds(),
                        preview.contentType().equals("unknown") ? "video" : preview.contentType());
            }
            if (isHostOrSubdomain(host, "tiktok.com") && (preview.title() == null || preview.thumbnailUrl() == null)) {
                JsonNode oEmbed = fetchJson("https://www.tiktok.com/oembed?url="
                        + URLEncoder.encode(originalUrl, StandardCharsets.UTF_8));
                return new Preview(firstNonBlank(preview.title(), jsonText(oEmbed, "title")), preview.description(),
                        firstNonBlank(preview.thumbnailUrl(), jsonText(oEmbed, "thumbnail_url")),
                        preview.videoDurationSeconds(), "video");
            }
        } catch (Exception ignored) {
            // Provider-specific metadata is optional; keep any Open Graph fields already found.
        }
        return preview;
    }

    private JsonNode fetchJson(String url) {
        try {
            URI uri = safeSocialUri(URI.create(url));
            HttpRequest request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(3))
                    .header("User-Agent", "UniMarkLinkPreview/1.0")
                    .header("Accept", "application/json")
                    .GET().build();
            HttpResponse<InputStream> response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream body = response.body()) {
                if (response.statusCode() < 200 || response.statusCode() >= 300) return null;
                return objectMapper.readTree(readLimited(body));
            }
        } catch (Exception ignored) { return null; }
    }

    private static String jsonText(JsonNode node, String name) {
        JsonNode value = node == null ? null : node.get(name);
        return value == null || value.isNull() || value.asText().isBlank() ? null : value.asText();
    }

    private static String firstNonBlank(String first, String second) {
        return first == null || first.isBlank() ? second : first;
    }

    private static boolean isHostOrSubdomain(String host, String root) {
        return host.equals(root) || host.endsWith("." + root);
    }

    private static String youtubeVideoId(URI uri) {
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        if (host.equals("youtu.be")) {
            String path = uri.getPath();
            return path == null ? null : validYoutubeId(path.replaceFirst("^/", ""));
        }
        if (!isHostOrSubdomain(host, "youtube.com")) return null;
        String path = uri.getPath() == null ? "" : uri.getPath();
        if (path.equals("/watch")) {
            String query = uri.getRawQuery();
            if (query != null) for (String part : query.split("&")) {
                if (part.startsWith("v=")) return validYoutubeId(part.substring(2));
            }
        }
        for (String prefix : new String[] {"/shorts/", "/embed/", "/live/"}) {
            if (path.startsWith(prefix)) return validYoutubeId(path.substring(prefix.length()).split("/", 2)[0]);
        }
        return null;
    }

    private static String validYoutubeId(String value) {
        return value != null && value.matches("[A-Za-z0-9_-]{11}") ? value : null;
    }

    private static URI safeSocialUri(URI uri) throws Exception {
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (scheme == null || host == null || uri.getUserInfo() != null
                || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
            throw new IllegalArgumentException("Unsupported preview URI");
        }
        int port = uri.getPort();
        if (port != -1 && port != 80 && port != 443) throw new IllegalArgumentException("Unsupported preview port");
        if (!isAllowedHost(host.toLowerCase(Locale.ROOT))) throw new IllegalArgumentException("Preview host is not supported");
        // Social-site hostnames are allow-listed and must resolve to public addresses before connecting.
        for (InetAddress address : InetAddress.getAllByName(host)) {
            if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
                    || address.isSiteLocalAddress() || address.isMulticastAddress()) {
                throw new IllegalArgumentException("Preview host is not public");
            }
        }
        return uri;
    }

    private static boolean isAllowedHost(String host) {
        return ALLOWED_PREVIEW_HOSTS.stream().anyMatch(root -> host.equals(root) || host.endsWith("." + root));
    }

    private static String readLimited(InputStream input) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int total = 0;
        int count;
        while ((count = input.read(buffer)) != -1 && total < MAX_HTML_BYTES) {
            int allowed = Math.min(count, MAX_HTML_BYTES - total);
            output.write(buffer, 0, allowed);
            total += allowed;
        }
        return output.toString(StandardCharsets.UTF_8);
    }

    private static Preview parse(String html, URI pageUri) {
        java.util.Map<String, String> metadata = new java.util.HashMap<>();
        Matcher tags = META_TAG.matcher(html);
        while (tags.find()) {
            java.util.Map<String, String> attributes = new java.util.HashMap<>();
            Matcher matcher = ATTRIBUTE.matcher(tags.group());
            while (matcher.find()) {
                String value = matcher.group(2) != null ? matcher.group(2)
                        : matcher.group(3) != null ? matcher.group(3) : matcher.group(4);
                attributes.put(matcher.group(1).toLowerCase(Locale.ROOT), HtmlUtils.htmlUnescape(value));
            }
            String key = attributes.getOrDefault("property", attributes.getOrDefault("name", attributes.get("itemprop")));
            String value = attributes.get("content");
            if (key != null && value != null) metadata.putIfAbsent(key.toLowerCase(Locale.ROOT), value.trim());
        }
        String title = first(metadata, "og:title", "twitter:title");
        if (title == null) {
            Matcher titleTag = TITLE_TAG.matcher(html);
            if (titleTag.find()) title = HtmlUtils.htmlUnescape(titleTag.group(1).replaceAll("(?s)<[^>]+>", " ").trim());
        }
        String description = first(metadata, "og:description", "twitter:description", "description");
        String image = first(metadata, "og:image", "og:image:url", "twitter:image", "twitter:image:src");
        Integer durationSeconds = videoDurationSeconds(metadata, html);
        if (image != null) {
            try {
                URI imageUri = pageUri.resolve(image.trim());
                String scheme = imageUri.getScheme();
                image = imageUri.getHost() != null && imageUri.getUserInfo() == null
                        && ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))
                        ? imageUri.toASCIIString() : null;
            } catch (Exception exception) { image = null; }
        }
        return new Preview(limit(title, 500), limit(description, 2000), image, durationSeconds,
                inferContentType(metadata.get("og:type"), metadata.get("twitter:card")));
    }

    private static Integer videoDurationSeconds(java.util.Map<String, String> metadata, String html) {
        String seconds = first(metadata, "og:video:duration", "video:duration");
        if (seconds != null && seconds.matches("\\d{1,8}")) return validDuration(Long.parseLong(seconds));
        String iso = first(metadata, "duration");
        Matcher youtubeLength = YOUTUBE_LENGTH_SECONDS.matcher(html);
        if (youtubeLength.find()) return validDuration(Long.parseLong(youtubeLength.group(1)));
        Matcher jsonDuration = Pattern.compile("(?i)\"duration\"\\s*:\\s*\"(PT[^\"]+)\"").matcher(html);
        if (jsonDuration.find()) iso = jsonDuration.group(1);
        if (iso == null) return null;
        Matcher parsed = ISO_DURATION.matcher(iso.trim());
        if (!parsed.matches()) return null;
        long hours = parsed.group(1) == null ? 0 : Long.parseLong(parsed.group(1));
        long minutes = parsed.group(2) == null ? 0 : Long.parseLong(parsed.group(2));
        double secs = parsed.group(3) == null ? 0 : Double.parseDouble(parsed.group(3));
        return validDuration(hours * 3600 + minutes * 60 + (long) Math.round(secs));
    }

    private static Integer validDuration(long seconds) {
        return seconds > 0 && seconds <= 172800 ? (int) seconds : null;
    }

    private static String first(java.util.Map<String, String> values, String... keys) {
        for (String key : keys) {
            String value = values.get(key);
            if (value != null && !value.isBlank()) return value;
        }
        return null;
    }

    private static String inferContentType(String ogType, String twitterCard) {
        String type = ((ogType == null ? "" : ogType) + " " + (twitterCard == null ? "" : twitterCard)).toLowerCase(Locale.ROOT);
        if (type.contains("video")) return "video";
        if (type.contains("article")) return "article";
        if (type.contains("image")) return "image";
        if (type.contains("profile") || type.contains("tweet") || type.contains("post")) return "post";
        return "unknown";
    }

    private static String limit(String value, int maxLength) {
        if (value == null || value.isBlank()) return null;
        String clean = value.replaceAll("\\s+", " ").trim();
        return clean.length() <= maxLength ? clean : clean.substring(0, maxLength);
    }

    public record Preview(String title, String description, String thumbnailUrl, Integer videoDurationSeconds, String contentType) {
        static Preview empty() { return new Preview(null, null, null, null, "unknown"); }
    }
}
