FROM node:20-bullseye-slim

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV npm_config_build_from_source=true

COPY . .

RUN rm -rf node_modules && npm install --omit=dev --legacy-peer-deps

EXPOSE 4000

CMD ["npm", "start"]
