FROM node:20-alpine AS builder

WORKDIR /app

COPY .npmrc ./
COPY ./apps/doc/package.json ./apps/doc/package-lock.json ./apps/doc/

WORKDIR /app/apps/doc
RUN npm ci

COPY ./apps/doc/docusaurus.config.cjs ./apps/doc/sidebars.cjs ./apps/doc/versions.json ./
COPY ./apps/doc/scripts ./scripts
COPY ./apps/doc/src ./src
COPY ./apps/doc/static ./static
COPY ./apps/doc/docs ./docs

ARG BASE_URL=/doc-center/
ARG API_DEFAULT_SPEC_PATH=/openapi.json
ARG API_REDOC_SCRIPT_PATH=/redoc/redoc.standalone.js
ARG API_SPEC_QUERY_PARAM=spec
ARG API_DEFAULT_DYNAMIC_SPEC_URL=http://127.0.0.1:8000/openapi.json

ENV BASE_URL=$BASE_URL
ENV API_DEFAULT_SPEC_PATH=$API_DEFAULT_SPEC_PATH
ENV API_REDOC_SCRIPT_PATH=$API_REDOC_SCRIPT_PATH
ENV API_SPEC_QUERY_PARAM=$API_SPEC_QUERY_PARAM
ENV API_DEFAULT_DYNAMIC_SPEC_URL=$API_DEFAULT_DYNAMIC_SPEC_URL

RUN npm run build

FROM nginx:1.27.5

COPY --from=builder /app/apps/doc/build /usr/share/nginx/html
COPY ./apps/doc/docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
