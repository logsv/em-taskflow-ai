FROM node:22-bullseye-slim

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps --no-audit --no-fund || \
    npm install --omit=dev --legacy-peer-deps --no-audit --no-fund

COPY . .

EXPOSE 4000

# --import newrelic/esm-loader.mjs bootstraps the New Relic agent BEFORE any
# ES module is loaded (import statements are hoisted in ESM — this is the only
# supported way to instrument ESM code with New Relic).
CMD ["node", "--import", "newrelic/esm-loader.mjs", "src/index.js"]
