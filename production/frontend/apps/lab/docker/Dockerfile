
FROM node:20-alpine AS builder

WORKDIR /app

COPY .npmrc ./
COPY ./apps/lab/package.json ./apps/lab/pnpm-lock.yaml ./apps/lab/
COPY ./packages ./packages
COPY ./tooling ./tooling

RUN npm install pnpm -g

WORKDIR /app/apps/lab
RUN pnpm install --frozen-lockfile
RUN ln -s /app/apps/lab/node_modules /app/node_modules
WORKDIR /app
COPY ./apps/lab ./apps/lab
COPY ./pnpm-workspace.yaml ./pnpm-workspace.yaml

WORKDIR /app/apps/lab
RUN pnpm build

FROM nginx:1.27.5
COPY --from=builder /app/apps/lab/dist /usr/share/nginx/html
COPY ./apps/lab/docker/nginx.conf /etc/nginx/conf.d/default.conf
