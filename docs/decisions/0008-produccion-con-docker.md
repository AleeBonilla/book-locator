# Decisión: producción en un servidor con Docker

- **Estado:** Aceptada
- **Fecha:** 2026-10-19

## Contexto

El sistema se despliega hoy en servicios gratuitos ([`despliegue.md`](../despliegue.md)): la web en Vercel, la API en Render y la base en Neon. Para alojarlo en un servidor de la universidad hay que entregar las especificaciones técnicas, pero todavía no se sabe qué ofrece TI: una máquina virtual, contenedores o una base de datos administrada.

## Decisión

### Docker Compose con un contenedor por pieza

El sistema se entrega como imágenes de Docker, coordinadas por [`docker-compose.prod.yaml`](../../docker-compose.prod.yaml). Al servidor solo se le pide Docker. No hace falta instalar Node ni PostgreSQL, y la misma configuración se prueba antes en cualquier máquina.

Cada pieza va en su propio contenedor, en lugar de juntarlas todas en una imagen:

- **`postgres`** usa la imagen oficial y guarda sus datos en un volumen. Respaldarla y actualizarla no depende de la API, y si TI ofrece su propia base de datos, este servicio se quita sin tocar los demás.
- **`api`** se construye en varias etapas ([`Dockerfile`](../../Dockerfile)): compila con todas las dependencias y conserva solo `dist/` y las dependencias de producción. Corre sin privilegios de root.
- **`web`** es nginx con la web compilada.

### nginx en lugar de servir la web desde la API

nginx sirve los archivos estáticos y reenvía `/api/*` a la API sin el prefijo, como hacen hoy `vercel.json` en producción y Vite en desarrollo. Así la web y la API comparten el mismo origen y la cookie de sesión funciona sin CORS, y además la API no cambia. nginx también comprime las respuestas y guarda en caché los archivos con hash.

### Migraciones automáticas

El servicio `migrate` corre `migrate.js` antes de que arranque la API. La API espera a que termine bien (`service_completed_successfully`). Las migraciones quedan anotadas en `schema_migrations`, así que una actualización (`up -d --build`) aplica solo las nuevas. A diferencia de la base de desarrollo, no se usa `docker-entrypoint-initdb.d`, que solo corre al crear la base.

### HTTPS fuera de los contenedores

El certificado lo pone el proxy inverso de la institución, delante del puerto de la web. La cookie `Secure` exige HTTPS, pero el certificado y el dominio son de TI. Si no hubiera un proxy, se puede agregar un contenedor con Caddy o nginx con certificados.

## Consecuencias

- El despliegue gratuito de `despliegue.md` sigue funcionando igual. Las dos formas usan el mismo código.
- Una sola instancia de la API: guarda en memoria el esquema activo ([decisión 0007](0007-busqueda-publica.md)). Varias instancias también funcionarían, porque cada una recarga su copia al cambiar el esquema activo.
- Los scripts de administración (`create-user`, `seed-demo`) se ejecutan dentro de la imagen, compilados (`node apps/api/dist/scripts/…`), porque la imagen no incluye `tsx`.
