# Imágenes de producción, en varias etapas. docker-compose.prod.yaml construye
# dos de ellas con `target`:
#
# - api: Node 24 con la API compilada, sus dependencias de producción, las
#   migraciones y los datos de demostración (database/).
# - web: nginx con la web compilada; reenvía /api/* a la API.
#
# Instalación en un servidor: docs/instalacion-docker.md.

# --- build: instala todo (también las devDependencies) y compila ------------
FROM node:24-alpine AS build
WORKDIR /app

# Primero solo los manifiestos: mientras no cambien, Docker reutiliza la capa
# de `npm ci` aunque cambie el código.
COPY package.json package-lock.json ./
COPY packages/classification/package.json packages/classification/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# `npm ci` instala exactamente lo que dice package-lock.json. --ignore-scripts
# evita el postinstall de la raíz (compilar @bjff/classification), que todavía
# no tiene su código; se compila abajo junto con la API y la web.
RUN npm ci --ignore-scripts

COPY packages/ packages/
COPY apps/ apps/
RUN npm run build

# --- api-deps: solo las dependencias de producción de la API ----------------
FROM node:24-alpine AS api-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/classification/package.json packages/classification/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# --omit=dev deja fuera TypeScript, tsx y los @types/*, que solo hacen falta
# para compilar; -w api, las dependencias de la web (React, Vite…). El
# mkdir asegura que exista la carpeta que copia la etapa api.
RUN npm ci --omit=dev --ignore-scripts -w api && mkdir -p apps/api/node_modules

# --- api ---------------------------------------------------------------------
FROM node:24-alpine AS api
ENV NODE_ENV=production
WORKDIR /app

COPY --from=api-deps /app/node_modules node_modules
COPY --from=api-deps /app/apps/api/node_modules apps/api/node_modules
COPY package.json ./
COPY packages/classification/package.json packages/classification/
COPY --from=build /app/packages/classification/dist packages/classification/dist
COPY apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist apps/api/dist
# Los scripts compilados (dist/scripts/migrate.js, seed-demo.js) buscan
# database/ en la raíz del repositorio, igual que en desarrollo.
COPY database/ database/

# El proceso no corre como root dentro del contenedor.
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/index.js"]

# --- web ---------------------------------------------------------------------
FROM nginx:1.28-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
