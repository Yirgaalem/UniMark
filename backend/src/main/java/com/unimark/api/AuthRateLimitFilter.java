package com.unimark.api;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/** Small single-instance guard for local MVP auth endpoints. Use shared rate-limit storage when scaling out. */
@Component
public class AuthRateLimitFilter extends OncePerRequestFilter {
    private static final Duration WINDOW = Duration.ofMinutes(1);
    private static final int LOGIN_LIMIT_PER_MINUTE = 10;
    private static final int REFRESH_LIMIT_PER_MINUTE = 30;
    private final ConcurrentHashMap<String, WindowCount> buckets = new ConcurrentHashMap<>();
    private final AtomicLong cleanupCounter = new AtomicLong();

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        if (!"POST".equalsIgnoreCase(request.getMethod()) || !isAuthRoute(path)) {
            chain.doFilter(request, response);
            return;
        }

        Instant now = Instant.now();
        int limit = path.endsWith("/refresh") ? REFRESH_LIMIT_PER_MINUTE : LOGIN_LIMIT_PER_MINUTE;
        String key = request.getRemoteAddr() + ":" + path;
        WindowCount bucket = buckets.compute(key, (ignored, previous) -> {
            if (previous == null || Duration.between(previous.startedAt(), now).compareTo(WINDOW) >= 0) {
                return new WindowCount(now, 1);
            }
            return new WindowCount(previous.startedAt(), previous.count() + 1);
        });
        if (cleanupCounter.incrementAndGet() % 512 == 0) {
            buckets.entrySet().removeIf(entry -> Duration.between(entry.getValue().startedAt(), now).compareTo(WINDOW.multipliedBy(2)) >= 0);
        }
        if (bucket.count() > limit) {
            response.setStatus(429);
            response.setHeader("Retry-After", "60");
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("{\"type\":\"rate_limit\",\"title\":\"Too many requests\",\"status\":429,\"detail\":\"Please wait before trying this authentication action again.\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    private static boolean isAuthRoute(String path) {
        return path.equals("/api/v1/auth/register") || path.equals("/api/v1/auth/login")
                || path.equals("/api/v1/auth/google") || path.equals("/api/v1/auth/refresh")
                || path.equals("/api/v1/auth/email-code/verify")
                || path.equals("/api/v1/auth/email-code/resend");
    }

    private record WindowCount(Instant startedAt, int count) {}
}
