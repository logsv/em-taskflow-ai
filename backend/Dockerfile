# bookworm, not bullseye: bullseye's security pool has been pruning packages, so
# `apt-get install` on it fails with 404s. No apt step is needed: every native
# dependency (Temporal core-bridge, onnxruntime, sharp) ships a prebuilt linux binary.
FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps --no-audit --no-fund --onnxruntime-node-install-cuda=skip

COPY . .

EXPOSE 4000

CMD ["node", "src/index.js"]
