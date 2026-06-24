FROM node:18.16.0

WORKDIR /app

COPY frontend/package.json ./package.json

# Set npm mirror for better download speed in China
RUN npm config set registry https://registry.npmmirror.com && \
    npm install pnpm -g

RUN pnpm install

COPY frontend/ .

# Build with TS error ignore flag and verify output
RUN npm run build

FROM nginx:1.27.5
# Update path to match the actual build output directory
COPY --from=0 /app/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf