# Demo image: api and worker share this build. Frontend is baked in; Node runs the compiled server/dist.
FROM node:26-bookworm-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.24.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/
COPY server/package.json server/
RUN pnpm install --frozen-lockfile
COPY frontend frontend
COPY server server
RUN pnpm --filter frontend build && pnpm --filter server build

FROM node:26-bookworm-slim
WORKDIR /app
RUN npm install -g pnpm@11.24.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/
COPY server/package.json server/
RUN pnpm install --frozen-lockfile --prod
COPY server/drizzle server/drizzle
COPY server/fixtures/kb server/fixtures/kb
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/frontend/dist frontend/dist
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENV STATIC_DIR=/app/frontend/dist
ENV NODE_ENV=production
EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "--enable-source-maps", "server/dist/src/api.js"]
