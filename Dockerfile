# Two images from one file:
#   docker build --target api .   -> Node API
#   docker build --target web .   -> Nginx serving client/dist and proxying /api to the API
# docker-compose.yml builds both.

# ---- Client build ----
FROM node:22-bookworm-slim AS client-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci -w client --include-workspace-root=false
COPY client client
RUN npm run build -w client

# ---- API ----
FROM node:22-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci -w server --omit=dev --include-workspace-root=false && npm cache clean --force
COPY server/src server/src
COPY server/scripts server/scripts
RUN mkdir -p /data/upload-staging && chown -R node:node /data
USER node
WORKDIR /app/server
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]

# ---- Web ----
FROM nginx:1.27-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=client-build /app/client/dist /usr/share/nginx/html
EXPOSE 80
