FROM node:22-bullseye-slim

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps --no-audit --no-fund --onnxruntime-node-install-cuda=skip


COPY . .

EXPOSE 4000

CMD ["node", "src/index.js"]
