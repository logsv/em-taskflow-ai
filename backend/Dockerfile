FROM node:20-bullseye-slim

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

CMD ["npm", "start"]
