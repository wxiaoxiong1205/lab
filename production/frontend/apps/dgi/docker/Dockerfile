FROM node:20-alpine as builder

WORKDIR /app

# 复制依赖到工作目录
COPY .npmrc ./
COPY ./apps/dgi/package.json ./apps/dgi/pnpm-lock.yaml ./apps/dgi/
# COPY ./packages/pkgA/package.json ./packages/pkgA/pnpm-lock.yaml ./packages/pkgA/

RUN npm install pnpm -g

RUN pnpm install -r --frozen-lockfile

# 复制源代码到工作目录
COPY ./apps/dgi ./apps/dgi
# COPY ./packages/xxx ./packages/xxx

# Build with TS error ignore flag and verify output
RUN pnpm -F dgi build

FROM nginx:1.27.5
# Update path to match the actual build output directory
COPY --from=builder /app/apps/dgi/dist /usr/share/nginx/html
COPY ./apps/dgi/docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000
ENV PORT=3000