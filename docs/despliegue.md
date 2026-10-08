# Despliegue gratuito

La aplicación se despliega en tres servicios con plan gratuito:

| Pieza | Servicio | Configuración |
|---|---|---|
| Base de datos | [Neon](https://neon.tech) (PostgreSQL) | Se migra desde la máquina local con `npm run migrate -w api`. |
| API | [Render](https://render.com) (web service) | [`render.yaml`](../render.yaml) |
| Web | [Vercel](https://vercel.com) | [`apps/web/vercel.json`](../apps/web/vercel.json) |

```text
navegador ──► Vercel (web estática)
                 └─ /api/* ──► Render (API) ──► Neon (PostgreSQL)
```

Vercel reenvía `/api/*` a la API. Así el navegador habla con un solo origen, como en desarrollo con el proxy de Vite, y la cookie de sesión funciona sin configurar CORS.

> Las condiciones de los planes gratuitos cambian. Antes de empezar, conviene revisar los límites vigentes de cada servicio.

## 1. Base de datos en Neon

1. Crear una cuenta y un proyecto en Neon, con PostgreSQL 16 y la región más cercana (p. ej. `us-east`).
2. Crear una base llamada `bjff_book_locator`.
3. Copiar la cadena de conexión (*Connection string*). Tiene la forma `postgres://usuario:contraseña@servidor.neon.tech/bjff_book_locator?sslmode=require`.

La cadena incluye la contraseña: no va en el repositorio ni en archivos versionados.

## 2. Migraciones y primer usuario

Desde la máquina local, en la raíz del repositorio y con las dependencias instaladas (`npm install`):

```sh
export DATABASE_URL='postgres://…?sslmode=require'   # la cadena de Neon

npm run migrate -w api      # aplica database/001…005 y las anota en schema_migrations
npm run create-user -w api -- --username ana --email ana@example.com --name "Ana Pérez"
npm run seed-demo -w api -- --activate   # opcional: la sala general de demostración
```

`create-user` pide la contraseña por teclado. `seed-demo` crea, publica y pone en uso un esquema con la estructura del plano y los rangos limpios del inventario ([datos de demostración](../database/demo/README.md)); sin él, la búsqueda pública responde «no está disponible» hasta que se active un esquema desde el panel. Cuando haya migraciones nuevas, se vuelve a correr `npm run migrate -w api` con la misma variable: solo aplica las pendientes.

Para dejar de usar Neon en la terminal, `unset DATABASE_URL`: sin ella, la API vuelve a usar la base local (`DB_*` de `apps/api/.env`).

## 3. API en Render

1. Subir los cambios a GitHub (Render despliega desde `main`).
2. En Render: **New → Blueprint**, elegir el repositorio. Render lee `render.yaml` y propone el servicio `bjff-book-locator-api`.
3. Cuando pida `DATABASE_URL`, pegar la cadena de Neon.
4. Esperar el primer despliegue y abrir `https://<servicio>.onrender.com/health`. Debe responder `{"status":"ok"}`.

Qué hace `render.yaml`:

- Instala con `npm ci --include=dev`: sin esa opción, con `NODE_ENV=production` npm omitiría TypeScript, que hace falta para compilar.
- Compila el paquete compartido (el `postinstall` de la raíz) y la API, y arranca `node apps/api/dist/index.js`.
- Con `NODE_ENV=production`, la cookie de sesión lleva `Secure`: solo viaja por HTTPS.

Si Render le asigna al servicio otra dirección (por ejemplo, porque el nombre ya estaba tomado), hay que actualizarla en `apps/web/vercel.json` (paso 4).

## 4. Web en Vercel

1. En Vercel: **Add New → Project**, importar el repositorio.
2. En **Root Directory**, elegir `apps/web`. Vercel detecta que es parte de un monorepo con npm workspaces e instala desde la raíz.
3. Dejar el resto como viene: `vercel.json` ya indica el framework (Vite), el comando de compilación y la carpeta `dist`.
4. Desplegar y abrir la dirección que asigna Vercel (`https://<proyecto>.vercel.app`).

`vercel.json` tiene dos reglas:

- `/api/*` se reenvía a `https://bjff-book-locator-api.onrender.com/*`. Si la API quedó en otra dirección, se cambia aquí y se vuelve a desplegar.
- Cualquier otra ruta (`/acceso`, `/admin/esquemas/3`) devuelve `index.html`, para que React Router la resuelva al recargar la página.

## 5. Comprobar

1. Abrir la web y entrar en `/acceso` con el usuario del paso 2.
2. Crear un esquema, su estructura, los rangos y el plano; publicarlo y activarlo.
3. Buscar un código en la página pública.

La búsqueda pública responde «no está disponible» hasta que haya un esquema activo.

## Limitaciones del plan gratuito

- **La API se duerme.** Render detiene el servicio gratuito tras unos 15 minutos sin peticiones. La primera petición después tarda entre 30 y 60 segundos, y en ese rato la búsqueda muestra «Buscando…». La web en sí carga al instante, porque es estática en Vercel.
- **Neon suspende la base** cuando no se usa. Se reactiva sola en la primera consulta, con una demora de menos de un segundo.
- **Sin límite de búsquedas por IP.** La [decisión 0007](decisions/0007-busqueda-publica.md) lo dejó pendiente. Antes de anunciar la dirección públicamente conviene implementarlo, también para los intentos de inicio de sesión.

## Variables de entorno

| Variable | Dónde | Valor |
|---|---|---|
| `DATABASE_URL` | Render (y la terminal local al migrar) | Cadena de conexión de Neon, con `?sslmode=require`. |
| `NODE_ENV` | Render (`render.yaml`) | `production` |
| `NODE_VERSION` | Render (`render.yaml`) | `24` |
| `PORT` | Render | La asigna Render; la API la lee sola. |
