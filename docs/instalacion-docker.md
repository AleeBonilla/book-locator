# Instalación en un servidor con Docker

Esta guía instala el sistema completo en un servidor propio: base de datos, API y web, cada una en un contenedor. Es la alternativa al despliegue en servicios gratuitos de [`despliegue.md`](despliegue.md). Los motivos están en la [decisión 0008](decisions/0008-produccion-con-docker.md).

```text
                          servidor (docker-compose.prod.yaml)
                ┌──────────────────────────────────────────────────────────┐
navegador ─────►│ web (nginx) ── /api/* ──► api (Node 24) ──► postgres (16) │
 HTTPS por el   │  :80 → WEB_PORT          :3000             :5432  volumen │
 proxy de TI    └──────────────────────────────────────────────────────────┘
```

| Servicio | Imagen | Qué hace |
|---|---|---|
| `postgres` | `postgres:16-alpine` | La base de datos. Guarda sus datos en el volumen `postgres_data`. |
| `migrate` | `bjff-book-locator-api` | Aplica las migraciones pendientes de `database/` y termina. Corre en cada arranque. |
| `api` | `bjff-book-locator-api` ([`Dockerfile`](../Dockerfile), etapa `api`) | La API en Node 24. |
| `web` | `bjff-book-locator-web` (etapa `web`) | nginx: sirve la web compilada y reenvía `/api/*` a la API ([`docker/nginx.conf`](../docker/nginx.conf)). |

Solo `web` publica un puerto en el servidor. La base y la API únicamente aceptan conexiones de los otros contenedores.

## Requisitos

- Linux de 64 bits (probado en x86-64) con **Docker Engine** y el complemento **Docker Compose v2** (`docker compose`).
- **Git**, para clonar el repositorio. Las imágenes se construyen en el propio servidor, así que no hace falta instalar Node ni PostgreSQL.
- Acceso a internet durante la construcción: Docker descarga las imágenes base y npm descarga las dependencias.
- **HTTPS delante de la web.** La cookie de sesión lleva el atributo `Secure`, así que el navegador solo la envía por HTTPS. Sin HTTPS, la búsqueda pública funciona, pero no se puede iniciar sesión en el panel. La excepción es `http://localhost`, que los navegadores tratan como seguro.

Los requisitos de hardware y de red están en el informe técnico.

## Instalación

```sh
git clone <url-del-repositorio> bjff-book-locator
cd bjff-book-locator

cp .env.example .env
# Editar .env: POSTGRES_PASSWORD (p. ej. la salida de `openssl rand -hex 24`) y WEB_PORT.

docker compose -f docker-compose.prod.yaml up -d --build
```

El primer `up` tarda unos minutos, porque compila la web y la API. Después:

```sh
docker compose -f docker-compose.prod.yaml ps       # api y postgres «healthy», migrate «Exited (0)»
curl http://localhost:8080/api/health               # {"status":"ok"}
```

### Primer usuario y datos de demostración

```sh
docker compose -f docker-compose.prod.yaml run --rm api \
  node apps/api/dist/scripts/create-user.js --username ana --email ana@example.com --name "Ana Pérez"

# Opcional: la sala general de demostración, publicada y activa (database/demo).
docker compose -f docker-compose.prod.yaml run --rm api \
  node apps/api/dist/scripts/seed-demo.js --activate
```

`create-user` pide la contraseña por teclado (mínimo 8 caracteres). Mientras no haya un esquema activo, la búsqueda pública responde «no está disponible». Un esquema se activa desde el panel o con `seed-demo --activate`.

## HTTPS con el proxy inverso

El proxy de TI recibe el tráfico HTTPS del dominio y lo reenvía a `http://<servidor>:<WEB_PORT>`. No hace falta nada más: la web y la API comparten el mismo origen, así que no hay que configurar CORS.

Si el proxy corre en la misma máquina, conviene poner `WEB_PORT=127.0.0.1:8080` en `.env`, para que la web no quede expuesta sin HTTPS. Ejemplo con nginx como proxy:

```nginx
server {
    listen 443 ssl;
    server_name localizador.ejemplo.ac.cr;
    # ssl_certificate y ssl_certificate_key: los certificados de la institución

    client_max_body_size 6m;   # los planos SVG pesan hasta 5 MB

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

## Operación

Todos los comandos se ejecutan en la carpeta del repositorio. `DC` abrevia `docker compose -f docker-compose.prod.yaml`.

| Tarea | Comando |
|---|---|
| Ver el estado | `DC ps` |
| Ver los registros | `DC logs -f api` (o `web`, `postgres`, `migrate`). Se conservan hasta 30 MB por contenedor. |
| Detener / volver a levantar | `DC down` / `DC up -d` (los datos se conservan en el volumen) |
| Actualizar a una versión nueva | `git pull` y `DC up -d --build` (las migraciones nuevas se aplican solas) |
| Respaldar la base | `DC exec -T postgres pg_dump -U bjff -Fc bjff_book_locator > respaldo.dump` |
| Restaurar un respaldo | `DC exec -T postgres pg_restore -U bjff -d bjff_book_locator --clean --if-exists < respaldo.dump` |

Los contenedores tienen `restart: unless-stopped`: vuelven a arrancar solos si fallan o si se reinicia el servidor, siempre que el servicio de Docker arranque con el sistema.

`DC down -v` también **borra el volumen con la base de datos**. Solo se usa para empezar de cero.

### Base de datos externa

Si TI ofrece un PostgreSQL 16 propio, se quita el servicio `postgres` de `docker-compose.prod.yaml` y se reemplaza `DATABASE_URL` (en `x-database-url`) por la cadena de esa base, con `?sslmode=require` si la conexión va cifrada. Las migraciones se aplican igual, con el servicio `migrate`.
