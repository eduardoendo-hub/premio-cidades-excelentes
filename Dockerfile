FROM node:22-alpine

WORKDIR /app

# Instala dependências primeiro (cache de camada)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copia o restante (site espelhado + código)
COPY . .

# Diretório de uploads persistente (monte um volume aqui no Coolify)
ENV UPLOADS_DIR=/data/uploads
RUN mkdir -p /data/uploads

EXPOSE 3000
ENV PORT=3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/healthz || exit 1

CMD ["node", "src/server.js"]
