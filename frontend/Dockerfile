FROM node:20-bullseye-slim AS build

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

ENV NODE_ENV=production

RUN npm run build

FROM nginx:stable-alpine

WORKDIR /usr/share/nginx/html

COPY --from=build /app/build .

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

