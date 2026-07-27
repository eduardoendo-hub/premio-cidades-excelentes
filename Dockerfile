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

CMD ["node", "src/server.js"]
