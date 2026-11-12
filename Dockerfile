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

# corepack trae la versión de pnpm fijada en "packageManager" (package.json).
RUN corepack enable

# Primero solo los manifiestos: mientras no cambien, Docker reutiliza la capa
# de `pnpm install` aunque cambie el código.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/classification/package.json packages/classification/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# --frozen-lockfile instala exactamente lo que dice pnpm-lock.yaml (falla si no
# coincide con los package.json). --ignore-scripts evita el postinstall de la
# raíz (compilar @bjff/classification), que todavía no tiene su código; se
# compila abajo junto con la API y la web. Los scripts de argon2 y esbuild
# (allowBuilds) sí hacen falta, así que se corren aparte con `pnpm rebuild`.
RUN pnpm install --frozen-lockfile --ignore-scripts && pnpm rebuild argon2 esbuild

COPY packages/ packages/
COPY apps/ apps/
RUN pnpm build

# --- api-deps: solo las dependencias de producción de la API ----------------
FROM node:24-alpine AS api-deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/classification/package.json packages/classification/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# --prod deja fuera TypeScript, tsx y los @types/*, que solo hacen falta para
# compilar; --filter "api..." instala solo la API y lo que ella usa
# (@bjff/classification), sin las dependencias de la web (React, Vite…).
# pnpm deja los paquetes en node_modules/.pnpm y enlaces simbólicos relativos
# en cada node_modules; COPY los conserva, así que la etapa api copia ambos.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter "api..." \
 && pnpm rebuild argon2 \
 && mkdir -p apps/api/node_modules

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
