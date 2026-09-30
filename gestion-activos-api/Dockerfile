# Imagen de DESARROLLO para gestion-activos-api (NestJS).
# No usar en producción: incluye devDependencies y corre en modo watch.

FROM node:24-bookworm-slim

# openssl: Prisma lo necesita en Linux para su motor de esquemas (db push / migrate).
# procps:  aporta `ps`, que Nest usa para matar el proceso anterior al recargar en
#          modo watch; sin él, el proceso viejo sigue vivo y da EADDRINUSE en :3000.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiamos solo los manifiestos primero para aprovechar la caché de capas:
# si no cambian las dependencias, Docker no vuelve a ejecutar npm ci.
COPY package.json package-lock.json ./
RUN npm ci

# El resto del código. En desarrollo, el volumen de docker-compose lo sobrescribe.
COPY . .

EXPOSE 3000

CMD ["npm", "run", "start:dev"]
