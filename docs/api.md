# Referencia de la API

Cuerpos y respuestas en JSON. Los errores siguen el formato de la [decisión 0004](decisions/0004-capas-y-errores-de-la-api.md): `{ error, details?, constraint? }`.

## Autenticación

| Método y ruta | Descripción |
|---|---|
| `POST /auth/login` | `{ identifier, password }` (usuario o correo). Crea la cookie de sesión. |
| `POST /auth/logout` | Cierra la sesión. |
| `GET /auth/me` | Usuario de la sesión. |

Las rutas de administración (`/schemes`, `/locations`) responden **401** sin sesión. Las de búsqueda (`/search`) son públicas.

## Búsqueda pública

Reglas en la [decisión 0007](decisions/0007-busqueda-publica.md).

| Método y ruta | Respuesta |
|---|---|
| `GET /search?code=…` | Dónde está el código en el esquema activo. **422** si el código es inválido; **503** si no hay esquema activo. |
| `GET /search/map` | Plano del esquema activo (`image/svg+xml`), con `ETag` (**304** si no cambió). |

```json
{
  "code": "001.42H557m^4",
  "scheme": { "scheme_id": 3, "name": "Sala general" },
  "found": true,
  "results": [{
    "relation": "contains",
    "range": { "start": "001.42A543c", "end": "001.42M321m^5" },
    "path": [
      { "location_id": 1, "code": "6", "name": "Fila 6", "level_name": "Fila", "position": 6, "siblings": 10 },
      { "location_id": 7, "code": "6-1", "name": "Cara 1", "level_name": "Cara", "position": 1, "siblings": 2 },
      { "location_id": 42, "code": "6-1-10", "name": "Mueble 10", "level_name": "Mueble", "position": 10, "siblings": 16 },
      { "location_id": 315, "code": "6-1-10-3", "name": "Anaquel 3", "level_name": "Anaquel", "position": 3, "siblings": 5 }
    ],
    "highlight_code": "6-1-10",
    "below_highlight": [
      { "location_id": 315, "code": "6-1-10-3", "name": "Anaquel 3", "level_name": "Anaquel", "position": 3, "siblings": 5 }
    ]
  }]
}
```

`relation` es `contains` (el rango contiene el código; puede haber varios si se solapan) o, si `found` es `false`, `before` / `after` (las ubicaciones a cada lado del hueco). `highlight_code` es la figura del plano que hay que resaltar (`id="loc-<código>"`).

## Esquemas

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /schemes` | — | Lista de esquemas, del más reciente al más antiguo. |
| `POST /schemes` | `{ name, short_description? }` | **201** con el esquema, en `DRAFT`. |
| `GET /schemes/:schemeId` | — | El esquema con `locations` (árbol) y `assignment` (estado del mínimo de asignación). |
| `PATCH /schemes/:schemeId` | `{ name?, short_description? }` | El esquema modificado. |
| `PUT /schemes/:schemeId/range-required` | `{ level_name, range_required }` | `{ updated, assignment }`: marca o desmarca como mínimo todas las ubicaciones con ese `level_name`. |

Un esquema no incluye el plano en las respuestas, solo `has_map`. El `status` lo calcula el backend ([decisión 0003 §2](decisions/0003-codigos-minimo-y-publicacion.md#2-mínimo-de-asignación-para-publicar)).

`assignment` informa qué impide llegar a `ASSIGNED`, por código de ubicación:

```json
{
  "required_count": 316,
  "required_with_range": 310,
  "uncovered_leaves": [],
  "nested_marks": [],
  "missing_ranges": ["6-1-14", "6-2-3"]
}
```

## Publicación

Reglas en la [decisión 0003 §4](decisions/0003-codigos-minimo-y-publicacion.md#4-publicación-congelamiento-y-copias).

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /schemes/:schemeId/publish` | — | El esquema publicado. |
| `POST /schemes/:schemeId/unpublish` | — | El esquema sin publicar, otra vez editable. |
| `POST /schemes/:schemeId/activate` | — | El esquema activo: el que usa la búsqueda pública. El anterior se desactiva en la misma operación. |
| `POST /schemes/:schemeId/copy` | `{ name? }` | **201** con la copia (como `GET /schemes/:id`). Por defecto se llama «Copia de …». |

Para publicar, el esquema debe estar en `ASSIGNED` y tener un plano que dibuje todas las ubicaciones obligatorias, sin etiquetas con códigos inexistentes, mal formadas ni repetidas. Si no, la respuesta es **409** y `details` dice qué falta:

```json
{ "error": "El plano no cumple los requisitos para publicar",
  "details": { "map": { "missing_required": [{ "code": "1-1-2", "name": "Mueble 2" }], "…": "…" } } }
```

(con `details.assignment` si falta el mínimo de asignación).

| Situación | Respuesta |
|---|---|
| Publicar un esquema ya publicado, o despublicar uno que no lo está | **409** |
| Despublicar el esquema activo (hay que activar otro antes) | **409** |
| Activar un esquema sin publicar o deshabilitado | **409** |

La copia conserva la estructura, los **códigos**, las marcas, los rangos y el plano, con ids de ubicación nuevos. Los códigos son únicos por esquema, así que el plano copiado sigue sirviendo sin cambios. Nace sin publicar ni activar.

## Ubicaciones

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /schemes/:schemeId/locations` | `{ parent_location_id?, name, level_name, level_name_override?, position? }` | **201** con la ubicación. Sin `position`, va al final de sus hermanos. |
| `POST /schemes/:schemeId/locations/batch` | `{ parent_location_id?, locations: [{ name, level_name, level_name_override?, range_required?, children? }] }` | **201** con `{ created, locations }`: cuántas se crearon y el árbol creado. Ver [Alta en lote](#alta-en-lote). |
| `PATCH /schemes/:schemeId/locations` | `{ changes: [{ location_id, name?, level_name?, level_name_override?, range_required? }] }` | `{ updated }`. Los mismos cambios que `PATCH /locations/:id`, para varias ubicaciones del esquema a la vez. |
| `PATCH /locations/:locationId` | `{ name?, level_name?, level_name_override?, range_required? }` | La ubicación modificada. |
| `POST /locations/:locationId/move` | `{ parent_location_id, position? }` | La ubicación en su nuevo lugar. `parent_location_id: null` la convierte en raíz. |
| `DELETE /locations/:locationId` | — | **204**. Elimina también todo su subárbol. |
| `PUT /locations/:locationId/range` | `{ start, end }` | La ubicación con su `range`. Ambos extremos incluidos. |
| `DELETE /locations/:locationId/range` | — | La ubicación sin rango. |

Una ubicación en la respuesta:

```json
{
  "location_id": 42,
  "parent_location_id": 7,
  "code": "6-1-10",
  "name": "Mueble 10",
  "level": 3,
  "level_name": "Mueble",
  "level_name_override": null,
  "display_level_name": "Mueble",
  "sort_order": 10,
  "range_required": true,
  "range": null,
  "children": []
}
```

- `code`, `level` y `sort_order` los calcula el backend: al crear, mover o eliminar, se recalculan los códigos de los hermanos y subárboles afectados ([decisión 0003 §1](decisions/0003-codigos-minimo-y-publicacion.md#1-los-códigos-de-ubicación-los-genera-el-backend)).
- `position` es la posición final entre los hermanos (1 = primera). Una posición mayor que la cantidad de hermanos + 1 responde **422**.

### Alta en lote

El panel arma la estructura de la sala (niveles y cuántas ubicaciones hay de cada uno) y la crea con una sola petición:

```json
{
  "parent_location_id": null,
  "locations": [
    { "name": "Fila 1", "level_name": "Fila", "children": [
      { "name": "Cara 1", "level_name": "Cara", "children": [
        { "name": "Mueble 1", "level_name": "Mueble", "range_required": true }
      ] }
    ] },
    { "name": "Mesa de consulta 1", "level_name": "Mesa de consulta" }
  ]
}
```

- Las del primer nivel van al final de las hijas de `parent_location_id` (o de las raíces), y cada una con lo que contiene. Códigos, niveles y posiciones se calculan igual que en el alta individual.
- Todo ocurre en una transacción: si algo falla, no se crea nada.
- Hasta 10 000 ubicaciones y 12 niveles por petición; más responde **400**. Esta ruta admite cuerpos de hasta 2 MB (las demás, 100 KB).
- Los nombres («Fila 1», «Mesa de consulta 1») los decide el panel; el backend los guarda tal cual.

`PATCH /schemes/:schemeId/locations` también es una transacción. Lo usa el panel para renombrar un nivel en todo el árbol y para renumerar los nombres automáticos después de mover o eliminar. Una ubicación de otro esquema responde **422**; un `location_id` repetido o un cambio sin campos, **400**.

### Cuándo se rechaza un cambio

| Situación | Respuesta |
|---|---|
| El esquema está publicado (cualquier cambio, incluido su nombre) | **409** |
| Crear (también en lote), mover o eliminar ubicaciones si alguna tiene rango ([0001 §4](decisions/0001-ubicaciones-y-mapas.md#4-el-árbol-queda-fijo-mientras-haya-rangos)) | **409** |
| El padre no pertenece al esquema, o se mueve una ubicación dentro de su propio subárbol | **422** |
| Datos con forma incorrecta (campos vacíos, tipos) | **400** |

Con rangos asignados se siguen pudiendo editar nombres y marcas del mínimo.

### Rangos

Reglas completas en la [decisión 0005](decisions/0005-rangos-de-ubicaciones.md).

| Situación | Respuesta |
|---|---|
| Algún extremo no es un código válido según [`normalization.md`](normalization.md) | **422**, con el motivo de cada extremo en `details` (`path`: `start` o `end`) |
| El inicio va después del fin según las [reglas de ordenamiento](classification-ordering.md) | **422** |
| El rango de la ubicación se calcula de sus hijos (todos tienen rango) | **409**: hay que cambiar el de algún hijo |
| El rango calculado de un ancestro quedaría invertido | **422**, sin guardar nada |
| El esquema está publicado | **409** |

Al asignar o borrar un rango, se actualizan los rangos calculados de los ancestros y el `status` del esquema.

## Plano del esquema

Reglas en las decisiones [0003 §3](decisions/0003-codigos-minimo-y-publicacion.md#3-etiquetado-del-plano) y [0006](decisions/0006-validacion-del-plano-svg.md); guía para quienes lo dibujan en [`guia-mapas.md`](guia-mapas.md).

El plano se envía como el archivo SVG tal cual, con `Content-Type: image/svg+xml` (otro tipo responde **415**). Máximo 5 MB (**413**).

| Método y ruta | Respuesta |
|---|---|
| `POST /schemes/:schemeId/map/validate` | Reporte del archivo frente al esquema, **sin guardarlo**. |
| `PUT /schemes/:schemeId/map` | Guarda o reemplaza el plano y devuelve el reporte. **422** si el contenido no es aceptable (el reporte va en `details`); el plano anterior se conserva. |
| `GET /schemes/:schemeId/map` | El SVG tal como se subió (`image/svg+xml`), con una política de contenido que impide ejecutar código si se abre directamente. |
| `GET /schemes/:schemeId/map/report` | Reporte del plano guardado frente al árbol **actual** (cambia si después se modificó la estructura o las marcas). |
| `DELETE /schemes/:schemeId/map` | **204**. |
| `GET /schemes/:schemeId/codes` | Hoja de códigos: `[{ code, label, name, path, required }]` en orden de árbol. Con `?format=csv`, un archivo para planillas (UTF-8 con BOM, separado por `;`). |

Reporte:

```json
{
  "valid": true,
  "issues": [],
  "labels": 316,
  "unknown_codes": [{ "code": "10-2-16", "line": 412 }],
  "malformed_labels": [{ "id": "loc-6-1-10 2", "line": 87 }],
  "duplicate_labels": [],
  "missing_required": [{ "code": "4-2-14", "name": "Mueble 14" }],
  "publishable": false
}
```

- `valid: false` (con `issues`, cada uno con su línea): el contenido no es seguro o no es un SVG válido; el plano no se guarda.
- `unknown_codes`, `malformed_labels`, `duplicate_labels` y `missing_required` no impiden guardar el plano, pero sí publicar el esquema; `publishable` resume si no hay ninguno.
- Un esquema publicado no admite cambios de plano (**409**).
