# BJFF Book Locator

Localizador de libros de la Biblioteca José Figueres Ferrer (Tecnológico de Costa Rica). Los lectores escriben el código de clasificación de un libro y ven en el plano en qué mueble y anaquel está; el personal administra la estructura de la sala, los rangos y el plano.

## Estructura

| Carpeta | Contenido |
|---|---|
| `apps/api` | API en Express 5 + TypeScript. Referencia: [`docs/api.md`](docs/api.md). |
| `apps/web` | Web en React + Vite: búsqueda pública (`/`), acceso (`/acceso`) y panel (`/admin`). |
| `packages/classification` | Paquete `@bjff/classification`: normaliza y ordena códigos ([`docs/normalization.md`](docs/normalization.md)). Lo usan la API y la web. |
| `database` | Migraciones de PostgreSQL, que `docker-compose.yaml` aplica al crear la base. |
| `docs` | Referencia de la API, reglas de los códigos, guía para dibujar planos y decisiones. |

Es un monorepo con [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces): hay un solo `package-lock.json` y un solo `node_modules`, en la raíz.

## Desarrollo

Requisitos: Node 24 y Docker.

```sh
npm install                      # en la raíz; también compila @bjff/classification
docker compose up -d             # PostgreSQL 16 con las migraciones
cp apps/api/.env.example apps/api/.env   # DB_PASSWORD: la de docker-compose.yaml
npm run create-user -w api -- --username ana --email ana@example.com --name "Ana Pérez"
```

Después, en dos terminales:

```sh
npm run dev:api                  # API en http://localhost:3000
npm run dev:web                  # web en http://localhost:5173
```

La web llama a la API en `/api` y Vite reenvía esas peticiones a `localhost:3000` (`API_URL` cambia el destino). Al ser el mismo origen, la cookie de sesión funciona sin configurar CORS.

En desarrollo, la API y la web usan el código fuente de `@bjff/classification` (condición `source` en sus `package.json` y `vite.config.ts`): un cambio en el paquete se ve sin recompilarlo. La compilación de producción usa su `dist/`.

## Pruebas y compilación

```sh
npm test                         # paquete y API (la API necesita la base levantada)
npm run lint -w bjff-book-locator-web
npm run build                    # paquete, API (apps/api/dist) y web (apps/web/dist)
```
