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

EXPOSE 4000 9229

# --import newrelic/esm-loader.mjs bootstraps the New Relic agent BEFORE any
# ES module is loaded, and --import newrelic initializes the agent runtime.
CMD ["node", "--import", "newrelic/esm-loader.mjs", "--import", "newrelic", "src/index.js"]
