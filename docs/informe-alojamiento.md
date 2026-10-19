# Informe técnico para el alojamiento de BJFF Book Locator

- **Sistema:** BJFF Book Locator, localizador de libros de la Biblioteca José Figueres Ferrer (TEC)
- **Destinatario:** equipo de TI que aloja el sistema
- **Responsable del sistema:** Alexander Bonilla (<correo de contacto>)
- **Fecha:** 19 de octubre de 2026
- **Versión del código:** rama `main` del repositorio (<url del repositorio>)

## 1. Resumen

BJFF Book Locator es una aplicación web. Un lector escribe el código de clasificación de un libro y ve en el plano de la sala en qué mueble y en qué anaquel está, sin iniciar sesión. El personal de la biblioteca entra a un panel con usuario y contraseña para mantener la estructura de la sala, los rangos de códigos de cada mueble y el plano.

Lo que se solicita es **una máquina virtual Linux con Docker, un subdominio con HTTPS y respaldos de la base de datos**. El detalle está en la [sección 8](#8-solicitud-a-ti).

| Aspecto | Valor |
|---|---|
| Tipo | Aplicación web: web estática, API REST y base de datos relacional |
| Entrega | Imágenes de Docker que se construyen en el servidor desde el repositorio, coordinadas con Docker Compose |
| Usuarios | Lectores anónimos (público) y personal de la biblioteca (pocas cuentas) |
| Datos personales | Solo del personal: nombre, usuario, correo y hash de la contraseña. De los lectores no se guarda nada. |
| Servicios externos | Ninguno en funcionamiento: sin correo, sin APIs de terceros, sin CDN |
| Criticidad | Baja: si el sistema no está disponible, el lector busca el libro como antes, sin el plano |

## 2. Arquitectura

```text
                                     servidor (Docker Compose)
                    ┌──────────────────────────────────────────────────────────────┐
navegador ──HTTPS──►│ proxy de TI ──HTTP──► web (nginx) ── /api/* ──► api (Node 24) │
                    │  certificado          WEB_PORT           :3000      │         │
                    │                                                     ▼         │
                    │                                         postgres (16) :5432   │
                    │                                         volumen postgres_data │
                    └──────────────────────────────────────────────────────────────┘
```

| Contenedor | Imagen base | Función | Expuesto al servidor |
|---|---|---|---|
| `web` | `nginx:1.28-alpine` | Sirve la web compilada (HTML, JS, CSS, fuentes). Reenvía `/api/*` a la API, comprime las respuestas y guarda en caché los archivos estáticos. | Sí: `WEB_PORT`, por defecto 8080 |
| `api` | `node:24-alpine` | API REST (Express 5, TypeScript compilado). Corre sin privilegios de root. | No |
| `migrate` | La misma de `api` | Aplica las migraciones pendientes de la base en cada arranque y termina. | No |
| `postgres` | `postgres:16-alpine` | Base de datos. Los datos persisten en un volumen de Docker. | No |

La web y la API comparten un mismo origen (la API bajo `/api`). Por eso la cookie de sesión funciona sin configurar CORS, y el sistema debe ocupar la **raíz** de un dominio o subdominio, no una subcarpeta.

### Tecnologías

| Pieza | Tecnologías principales |
|---|---|
| Web | React 19, React Router, Vite 8 (compilación), DOMPurify |
| API | Node.js 24, Express 5, pg (cliente PostgreSQL), argon2, Zod, saxes |
| Base de datos | PostgreSQL 16 (PL/pgSQL, claves `BYTEA`, restricciones diferidas) |
| Código compartido | `@bjff/classification`: normalización y ordenamiento de códigos, en TypeScript |

Todas las dependencias son de código abierto y se instalan desde npm con versiones fijas (`package-lock.json`).

## 3. Requisitos del servidor

### Software

| Requisito | Versión | Notas |
|---|---|---|
| Sistema operativo | Linux de 64 bits (x86-64) | Cualquier distribución que soporte Docker. Probado en x86-64. |
| Docker Engine | 24 o superior | Probado con 29.8. Debe arrancar con el sistema. |
| Docker Compose | v2 (complemento `docker compose`) | Probado con 5.5. |
| Git | Cualquiera reciente | Para clonar y actualizar el repositorio. |

No hace falta instalar Node.js, PostgreSQL ni nginx en el servidor: vienen en las imágenes.

### Hardware

| Recurso | Mínimo | Recomendado | Justificación (sección 7) |
|---|---|---|---|
| CPU | 1 vCPU | 2 vCPU | La API usa un núcleo. La compilación de la imagen es más rápida con dos. |
| RAM | 1 GB | 2 GB | En funcionamiento, unos 80 MB en reposo y menos de 200 MB bajo carga alta, para los tres contenedores. La compilación (npm, TypeScript, Vite) es el momento de mayor consumo. |
| Disco | 10 GB libres | 20 GB | Imágenes y caché de compilación: unos 2 GB. Base de datos: unos 10 MB con un esquema. Registros: 30 MB por contenedor como máximo. El resto es margen para el sistema operativo y los respaldos locales. |

## 4. Red y dominio

| Requisito | Detalle |
|---|---|
| Dominio | Un subdominio propio (p. ej. `localizador.<dominio-institucional>`), apuntado a la raíz del sistema. |
| HTTPS | **Obligatorio para el personal.** La cookie de sesión lleva `Secure` y el navegador no la envía por HTTP, así que sin HTTPS no se puede iniciar sesión. Se espera que el certificado y la terminación TLS los ponga el proxy inverso de TI. |
| Puerto de entrada | 443 en el proxy, que reenvía a `http://<servidor>:<WEB_PORT>` (8080 por defecto). Si el proxy está en la misma máquina, se configura `WEB_PORT=127.0.0.1:8080`. La base y la API no publican puertos. |
| Cuerpo de las peticiones | El proxy debe aceptar cuerpos de hasta 6 MB, porque el personal sube planos SVG de hasta 5 MB. En nginx: `client_max_body_size 6m`. |
| Salida a internet | Solo para instalar y actualizar: Docker Hub (imágenes base), `registry.npmjs.org` (dependencias) y el servidor de Git. En funcionamiento, el sistema no hace conexiones salientes. |
| Correo | No usa. |

En la [guía de instalación](instalacion-docker.md#https-con-el-proxy-inverso) hay un ejemplo de configuración del proxy en nginx.

## 5. Seguridad

### Lo que el sistema ya hace

- **Contraseñas:** se guardan con argon2id, con sal y costo incluidos en el hash. Nunca en texto plano.
- **Sesiones:** token aleatorio de 256 bits en una cookie `HttpOnly`, `Secure` y `SameSite=Lax`, que vence a los 7 días. La base solo guarda el hash del token, y cerrar sesión lo revoca.
- **Inicio de sesión:** el mensaje y el tiempo de respuesta son los mismos si el usuario no existe o si la contraseña es incorrecta.
- **Entradas:** todas las peticiones se validan con esquemas (Zod) antes de llegar a la lógica. Las consultas SQL usan parámetros.
- **Planos SVG:** se rechaza cualquier contenido fuera de una lista blanca (scripts, enlaces externos, eventos). El navegador vuelve a limpiarlos y se sirven con una política de contenido (`Content-Security-Policy`) que bloquea scripts.
- **Aislamiento:** la base y la API solo aceptan conexiones dentro de la red interna de Docker. La API corre sin privilegios de root.
- **Secretos:** la contraseña de la base va en un archivo `.env` del servidor, que no se versiona.

### Pendientes y recomendaciones

- **Límite de peticiones:** el sistema todavía no limita las búsquedas ni los intentos de inicio de sesión por IP. Se recomienda limitar `/api/auth/login` en el proxy de TI, por ejemplo a 10 intentos por minuto por IP.
- **Roles:** toda cuenta del personal tiene acceso completo al panel. Las cuentas las crea el responsable desde el servidor, y no hay registro público.
- **Actualizaciones:** las imágenes base (`node:24-alpine`, `nginx:1.28-alpine`, `postgres:16-alpine`) reciben parches de seguridad. Reconstruir periódicamente las incorpora: `docker compose -f docker-compose.prod.yaml build --pull` y después `up -d`. `postgres` se actualiza con `pull postgres`.

## 6. Operación

Los procedimientos completos están en la [guía de instalación con Docker](instalacion-docker.md).

| Tarea | Cómo | Frecuencia sugerida |
|---|---|---|
| Instalación | Clonar, copiar `.env.example` a `.env`, `docker compose -f docker-compose.prod.yaml up -d --build` | Una vez |
| Cuentas del personal | `create-user` dentro del contenedor de la API | Cuando se necesite |
| Actualización | `git pull` y `up -d --build`. Las migraciones nuevas se aplican solas antes de arrancar la API. | Con cada versión nueva |
| Respaldo | `pg_dump -Fc` desde el contenedor de la base. Con los datos actuales ocupa menos de 1 MB. | Diaria, y antes de cada actualización |
| Restauración | `pg_restore --clean` desde el mismo contenedor | Ante una pérdida de datos |
| Monitoreo | `GET /api/health` responde `200 {"status":"ok"}` si la API alcanza la base, y `503` si no. Docker usa la misma ruta para el estado `healthy` del contenedor. | Cada 1 a 5 minutos, si TI tiene monitoreo |
| Registros | `docker compose logs`. Se rotan solos: 3 archivos de 10 MB por contenedor. | Ante incidentes |

Los contenedores se reinician solos si fallan o si se reinicia el servidor (`restart: unless-stopped`). Un respaldo de la base basta para reconstruir el sistema completo: el resto sale del repositorio.

## 7. Mediciones

Medido el 19 de octubre de 2026 sobre las imágenes de producción, con el esquema de demostración cargado: la sala general, con 1941 ubicaciones y un plano de 830 KB. El equipo de prueba fue Windows 11 con Docker Desktop, que tenía asignados 12 CPU y 12 GB. Un servidor más pequeño dará cifras menores de rendimiento, pero el consumo de memoria es comparable.

| Medida | Resultado |
|---|---|
| Memoria en reposo | api 39 MB, postgres 27 MB, web 11 MB (unos 77 MB en total) |
| Memoria máxima bajo carga | api 108 MB, postgres 51 MB, web 18 MB |
| Búsquedas con 50 conexiones simultáneas durante 20 s | Unas 2400 por segundo; latencia mediana de 20 ms y de 38 ms en el percentil 99; ningún error del servidor |
| Tamaño de la base | 9.8 MB (esquemas 0.95 MB, ubicaciones 0.85 MB) |
| Respaldo comprimido (`pg_dump -Fc`) | 0.66 MB |
| Imágenes de Docker | api 264 MB, web 95 MB, postgres 420 MB |
| Primera visita de un lector | Unos 1.1 MB comprimidos. La mayor parte es el plano (0.6 MB), el JavaScript (0.15 MB) y la fuente (0.25 MB). En las visitas siguientes, el navegador reutiliza su caché. |

La carga esperada es de algunas decenas de lectores a la vez, muy por debajo de lo medido. El crecimiento de la base es lento: cada esquema nuevo o cada copia ocupa unos 2 MB.

## 8. Solicitud a TI

1. Una máquina virtual Linux de 64 bits con **2 vCPU, 2 GB de RAM y 20 GB de disco** (mínimo: 1 vCPU, 1 GB y 10 GB).
2. Docker Engine y Docker Compose v2 instalados, con el servicio de Docker habilitado al arranque.
3. Un **subdominio** apuntado a la raíz del sistema, con **certificado HTTPS** y un proxy inverso hacia `WEB_PORT`, que acepte cuerpos de hasta 6 MB.
4. Salida a internet desde el servidor hacia Docker Hub, `registry.npmjs.org` y el servidor de Git, para instalar y actualizar.
5. Acceso por SSH para el responsable del sistema, para instalar, crear las cuentas del personal y actualizar.
6. **Respaldo diario** de la base (`pg_dump`) o del volumen `postgres_data`, guardado fuera del servidor.
7. Opcional: limitar los intentos de inicio de sesión por IP en el proxy, y monitorear `/api/health`.

Si TI prefiere ofrecer un PostgreSQL 16 administrado en lugar del contenedor de la base, el sistema lo admite cambiando la cadena de conexión ([guía, «Base de datos externa»](instalacion-docker.md#base-de-datos-externa)).

## Anexos

- [Requerimientos del sistema](requirements.md): funcionales, no funcionales y restricciones, con su trazabilidad.
- [Instalación en un servidor con Docker](instalacion-docker.md): instalación y operación paso a paso.
- [Decisión 0008](decisions/0008-produccion-con-docker.md): por qué Docker y cómo se organizan los contenedores.
- [Referencia de la API](api.md).
