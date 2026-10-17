# ─────────────────────────────────────────────────────────────────────────────
# Personal Portfolio — container image
#
#   docker build -t portfolio .
#   docker run --rm -p 8080:80 portfolio
#
# Stage 1 validates the static site (every referenced local asset exists, no
# duplicate ids, no dangling SVG symbol references) so a broken build fails
# here rather than in production. Stage 2 serves the validated files with nginx.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: validate ────────────────────────────────────────────────────────
FROM node:22-alpine AS validate

WORKDIR /site
COPY tools/ ./tools/
COPY index.html robots.txt ./
COPY assets/ ./assets/

# Set CHECK_PLACEHOLDERS=1 to also fail while example content is still in place.
# Leave it at 0 until you have swapped in your own name, links and portrait.
ARG CHECK_PLACEHOLDERS=0

RUN node tools/validate.mjs --check-placeholders="${CHECK_PLACEHOLDERS}"

# ── Stage 2: serve ───────────────────────────────────────────────────────────
FROM nginx:stable-alpine AS serve

LABEL org.opencontainers.image.title="Personal Portfolio" \
      org.opencontainers.image.description="Static split-screen developer portfolio"

# Replace the stock config with ours (gzip, cache headers, security headers)
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/snippets/ /etc/nginx/snippets/

# Only the files the site actually needs
COPY --from=validate /site/index.html /usr/share/nginx/html/index.html
COPY --from=validate /site/robots.txt  /usr/share/nginx/html/robots.txt
COPY --from=validate /site/assets/     /usr/share/nginx/html/assets/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1

STOPSIGNAL SIGQUIT
CMD ["nginx", "-g", "daemon off;"]