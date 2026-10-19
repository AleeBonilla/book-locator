# Informe técnico para el alojamiento de BJFF Book Locator

- **Sistema:** BJFF Book Locator, localizador de libros de la Biblioteca José Figueres Ferrer (TEC)
- **Destinatario:** equipo de TI que aloja el sistema
- **Responsable del sistema:** Alexander Bonilla (alebonilla@estudiantec.cr)
- **Fecha:** 19 de octubre de 2026

## 1. Resumen

BJFF Book Locator es una aplicación web para la biblioteca. El lector escribe el código de clasificación de un libro y ve en el plano de la sala en qué mueble y en qué anaquel está, sin iniciar sesión. El personal de la biblioteca entra a un panel con usuario y contraseña para mantener la información de la sala.

Para alojarlo se solicita **una máquina virtual Linux con Docker, un subdominio con HTTPS y respaldo diario de la base de datos**. La lista completa está en la sección 8.

| Aspecto | Valor |
|---|---|
| Tipo de sistema | Aplicación web: sitio estático, API REST y base de datos relacional |
| Forma de entrega | Contenedores Docker, coordinados con Docker Compose. Las imágenes se construyen en el propio servidor a partir del código fuente. |
| Usuarios | Lectores anónimos (público general) y personal de la biblioteca (pocas cuentas) |
| Datos personales | Solo del personal: nombre, usuario, correo y la contraseña cifrada con hash. De los lectores no se guarda ningún dato. |
| Servicios externos | Ninguno mientras el sistema funciona: no envía correo, no usa APIs de terceros ni CDN |
| Criticidad | Baja. Si el sistema no está disponible, el lector busca el libro como antes, sin el plano. |

## 2. Arquitectura

El sistema corre en cuatro contenedores dentro de un mismo servidor. Desde fuera solo es visible el contenedor web. Ese puerto queda detrás del proxy inverso de TI, que es quien pone el HTTPS.

```text
                               servidor (Docker Compose)
                ┌─────────────────────────────────────────────────────┐
 navegador      │                                                     │
   │ HTTPS      │  web (nginx) ──── /api/* ───► api (Node.js 24)      │
   ▼            │   puerto WEB_PORT                  │                │
 proxy de TI ──►│   (8080 por defecto)               ▼                │
 (certificado)  │                              postgres (16)          │
                │                              volumen de datos       │
                └─────────────────────────────────────────────────────┘
```

| Contenedor | Imagen base | Función | Puerto expuesto |
|---|---|---|---|
| `web` | `nginx:1.28-alpine` | Sirve el sitio (HTML, JavaScript, CSS y fuentes) y reenvía las rutas `/api/*` a la API. Comprime las respuestas y aplica caché a los archivos estáticos. | Sí: `WEB_PORT`, 8080 por defecto |
| `api` | `node:24-alpine` | API REST con la lógica del sistema. Se ejecuta sin privilegios de root. | No |
| `migrate` | La misma de `api` | En cada arranque actualiza la estructura de la base de datos si hace falta, y termina. | No |
| `postgres` | `postgres:16-alpine` | Base de datos. Los datos se guardan en un volumen de Docker y persisten entre reinicios. | No |

El sitio y la API se sirven desde un mismo dominio, con la API bajo `/api`. Por eso el sistema debe ocupar la **raíz** de un dominio o subdominio (`https://localizador.ejemplo/`); no funciona dentro de una subcarpeta (`https://ejemplo/localizador/`).

### Tecnologías

| Componente | Tecnología |
|---|---|
| Sitio web | React 19, compilado con Vite 8 a archivos estáticos |
| API | Node.js 24 con Express 5, en TypeScript |
| Base de datos | PostgreSQL 16 (usa funciones propias de PostgreSQL; no es compatible con otros motores) |
| Servidor web | nginx 1.28 |

Todas las dependencias son de código abierto y se instalan con versiones fijas.

## 3. Requisitos del servidor

### Software

| Requisito | Versión | Notas |
|---|---|---|
| Sistema operativo | Linux de 64 bits (x86-64) | Cualquier distribución con soporte para Docker. |
| Docker Engine | 24 o superior | Probado con la versión 29.8. El servicio debe arrancar con el sistema. |
| Docker Compose | v2 (comando `docker compose`) | Probado con la versión 5.5. |
| Git | Cualquier versión reciente | Para descargar y actualizar el código fuente. |

No hace falta instalar Node.js, PostgreSQL ni nginx en el servidor, porque vienen dentro de los contenedores.

### Hardware

| Recurso | Mínimo | Recomendado | Justificación |
|---|---|---|---|
| CPU | 1 vCPU | 2 vCPU | La API usa un núcleo. Construir las imágenes es más rápido con dos. |
| RAM | 1 GB | 2 GB | En funcionamiento, los contenedores usan unos 80 MB en reposo y menos de 200 MB bajo carga alta. El mayor consumo ocurre al construir las imágenes durante la instalación y las actualizaciones. |
| Disco | 10 GB libres | 20 GB | Unos 2 GB para imágenes y caché de construcción, unos 10 MB para la base de datos y hasta 30 MB de registros por contenedor. El resto es margen para el sistema operativo y los respaldos locales. |

## 4. Red y dominio

| Requisito | Detalle |
|---|---|
| Dominio | Un subdominio propio (por ejemplo, `localizador.<dominio-institucional>`) que apunte a la raíz del sistema. |
| HTTPS | **Obligatorio para el personal.** La cookie de sesión solo viaja por HTTPS, así que sin él no se puede iniciar sesión en el panel. La búsqueda pública sí funciona sin HTTPS. Se espera que el certificado lo ponga el proxy inverso de TI. |
| Puertos | Entrada: 443 en el proxy, que reenvía a `http://<servidor>:<WEB_PORT>` (8080 por defecto). Si el proxy corre en la misma máquina, la web puede escuchar solo en `127.0.0.1`. Ningún otro puerto se publica. |
| Tamaño de las peticiones | El proxy debe aceptar cuerpos de hasta **6 MB**, porque el personal sube planos de la sala de hasta 5 MB. |
| Salida a internet | Solo para instalar y actualizar: Docker Hub (imágenes base), `registry.npmjs.org` (dependencias) y GitHub (código fuente). En funcionamiento, el sistema no hace conexiones salientes. |
| Correo electrónico | No se usa. |

Ejemplo de configuración del proxy, si TI usa nginx:

```nginx
server {
    listen 443 ssl;
    server_name localizador.ejemplo.ac.cr;
    # ssl_certificate y ssl_certificate_key: certificados de la institución

    client_max_body_size 6m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

## 5. Seguridad

### Medidas incluidas en el sistema

- **Contraseñas:** se guardan con hash argon2id con sal, nunca en texto plano.
- **Sesiones:** un token aleatorio de 256 bits en una cookie `HttpOnly`, `Secure` y `SameSite=Lax`, que vence a los 7 días. Cerrar sesión lo revoca en el servidor.
- **Inicio de sesión:** un intento fallido no revela si el usuario existe.
- **Entradas:** todas las peticiones se validan antes de procesarse, y las consultas a la base de datos usan parámetros.
- **Archivos subidos:** el sistema solo recibe planos en formato SVG. Rechaza los que traen contenido ejecutable o enlaces externos, y los muestra con una política de contenido que bloquea scripts.
- **Aislamiento:** la base de datos y la API solo aceptan conexiones de la red interna de Docker. La API se ejecuta sin privilegios de root.
- **Secretos:** la contraseña de la base de datos se define en un archivo `.env` del servidor, que no forma parte del código fuente.
- **Cuentas:** no hay registro público. Las cuentas del personal las crea el responsable desde el servidor.

### Recomendaciones para TI

- **Limitar los intentos de inicio de sesión** por dirección IP en el proxy, por ejemplo 10 por minuto en la ruta `/api/auth/login`. El sistema todavía no lo hace por sí mismo.
- **Mantener actualizadas las imágenes base**, que reciben parches de seguridad. Basta con reconstruirlas periódicamente (sección 6).
- Todas las cuentas del personal tienen el mismo nivel de acceso al panel: no hay roles.

## 6. Instalación y operación

### Instalación

En la carpeta del código fuente, en el servidor:

```sh
cp .env.example .env
# En .env, definir:
#   POSTGRES_PASSWORD  contraseña de la base de datos, solo letras y números
#                      (por ejemplo, la salida de: openssl rand -hex 24)
#   WEB_PORT           8080, o 127.0.0.1:8080 si el proxy está en la misma máquina

docker compose -f docker-compose.prod.yaml up -d --build
```

La primera vez tarda unos minutos, porque construye las imágenes. Luego se comprueba así:

```sh
docker compose -f docker-compose.prod.yaml ps    # api y postgres en estado «healthy»
curl http://localhost:8080/api/health            # responde {"status":"ok"}
```

Por último, el responsable del sistema crea las cuentas del personal y carga los datos iniciales.

### Tareas de operación

En la tabla, `DC` abrevia `docker compose -f docker-compose.prod.yaml`, ejecutado en la carpeta del código fuente.

| Tarea | Comando | Frecuencia sugerida |
|---|---|---|
| Ver el estado | `DC ps` | Cuando se necesite |
| Ver los registros | `DC logs -f api` (o `web`, `postgres`). Se rotan solos: 3 archivos de 10 MB por contenedor. | Ante incidentes |
| Detener / volver a levantar | `DC down` / `DC up -d`. Los datos se conservan. | Cuando se necesite |
| Actualizar a una versión nueva | `git pull` y `DC up -d --build`. La base de datos se actualiza sola antes de arrancar la API. | Con cada versión nueva |
| Aplicar parches de las imágenes base | `DC build --pull`, `DC pull postgres` y `DC up -d` | Mensual |
| Respaldar la base de datos | `DC exec -T postgres pg_dump -U bjff -Fc bjff_book_locator > respaldo.dump` | Diaria, y antes de cada actualización |
| Restaurar un respaldo | `DC exec -T postgres pg_restore -U bjff -d bjff_book_locator --clean --if-exists < respaldo.dump` | Ante una pérdida de datos |

- Los contenedores se reinician solos si fallan o si se reinicia el servidor.
- **`DC down -v` borra el volumen con la base de datos.** Solo se usa para empezar de cero.
- Un respaldo de la base de datos basta para reconstruir el sistema completo. Todo lo demás sale del código fuente.

### Monitoreo

`GET /api/health` responde `200` con `{"status":"ok"}` si la API está en marcha y alcanza la base de datos, y `503` si no la alcanza. Docker usa la misma comprobación para marcar el contenedor como sano. Si TI tiene un sistema de monitoreo, se sugiere consultar esa ruta cada 1 a 5 minutos.

### Base de datos administrada por TI (opcional)

Si TI prefiere ofrecer un PostgreSQL 16 propio en lugar del contenedor `postgres`, el sistema lo admite. Se quita ese contenedor y se cambia la cadena de conexión de la base en `docker-compose.prod.yaml`. La estructura de la base se crea igual, sola, al arrancar.

## 7. Mediciones

Medido el 19 de octubre de 2026 sobre las imágenes de producción, con datos reales de la sala general de la biblioteca (1941 ubicaciones y un plano de 830 KB). El equipo de prueba fue Windows 11 con Docker Desktop, que tenía asignados 12 CPU y 12 GB de RAM. En un servidor más pequeño el rendimiento será menor, pero el consumo de memoria es comparable.

| Medida | Resultado |
|---|---|
| Memoria en reposo | api 39 MB, postgres 27 MB, web 11 MB (unos 77 MB en total) |
| Memoria máxima bajo carga | api 108 MB, postgres 51 MB, web 18 MB |
| Rendimiento con 50 conexiones simultáneas durante 20 s | Unas 2400 búsquedas por segundo. Latencia mediana de 20 ms y de 38 ms en el percentil 99. Ningún error. |
| Tamaño de la base de datos | 9.8 MB |
| Tamaño de un respaldo comprimido | 0.66 MB |
| Tamaño de las imágenes | api 264 MB, web 95 MB, postgres 420 MB |
| Datos descargados en la primera visita de un lector | Unos 1.1 MB comprimidos. En las visitas siguientes, el navegador reutiliza su caché. |

La carga esperada es de unas decenas de lectores a la vez, muy por debajo de lo medido. La base de datos crece lentamente: unos 2 MB por cada versión nueva del plano de la sala.

## 8. Solicitud a TI

1. Una máquina virtual Linux de 64 bits con **2 vCPU, 2 GB de RAM y 20 GB de disco**. El mínimo es 1 vCPU, 1 GB y 10 GB.
2. **Docker Engine y Docker Compose v2** instalados, con el servicio de Docker habilitado al arranque.
3. Un **subdominio** que apunte a la raíz del sistema, con **certificado HTTPS** y un proxy inverso hacia el puerto de la web, que acepte peticiones de hasta 6 MB.
4. **Salida a internet** desde el servidor hacia Docker Hub, `registry.npmjs.org` y GitHub, para instalar y actualizar.
5. **Acceso por SSH** para el responsable del sistema, para instalar, crear las cuentas del personal y actualizar.
6. **Respaldo diario** de la base de datos (con `pg_dump`) o del volumen de Docker, guardado fuera del servidor.
7. Opcional: limitar los intentos de inicio de sesión por IP en el proxy, y monitorear `/api/health`.
