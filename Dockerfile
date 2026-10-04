# Demo image: api and worker share this build. Frontend is baked in; Node runs the TS sources.
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.24.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/
COPY server/package.json server/
RUN pnpm install --frozen-lockfile
COPY frontend frontend
RUN pnpm --filter frontend build

FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.24.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/
COPY server/package.json server/
RUN pnpm install --frozen-lockfile --prod
COPY server server
COPY --from=build /app/frontend/dist frontend/dist
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENV STATIC_DIR=/app/frontend/dist
ENV NODE_ENV=production
EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server/src/api.ts"]
