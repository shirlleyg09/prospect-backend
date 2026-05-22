FROM node:20-slim

WORKDIR /app

# Dependências de sistema: OpenSSL (Prisma) + Chromium (Puppeteer PDF)
RUN apt-get update -y && \
    apt-get install -y openssl chromium fonts-liberation libgbm1 && \
    rm -rf /var/lib/apt/lists/*

# Pula o download do Chromium do puppeteer — usa o do sistema
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run prisma:generate
RUN npm run build

ENV NODE_ENV=production

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy --schema src/database/schema.prisma || true && node dist/main.js"]
