# Referencia de la API

Cuerpos y respuestas en JSON. Los errores siguen el formato de la [decisión 0004](decisions/0004-capas-y-errores-de-la-api.md): `{ error, details?, constraint? }`.

## Autenticación

| Método y ruta | Descripción |
|---|---|
| `POST /auth/login` | `{ identifier, password }` (usuario o correo). Crea la cookie de sesión. |
| `POST /auth/logout` | Cierra la sesión. |
| `GET /auth/me` | Usuario de la sesión. |

Las rutas de administración (`/schemes`, `/locations`) responden **401** sin sesión.

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

## Ubicaciones

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /schemes/:schemeId/locations` | `{ parent_location_id?, name, level_name, level_name_override?, position? }` | **201** con la ubicación. Sin `position`, va al final de sus hermanos. |
| `PATCH /locations/:locationId` | `{ name?, level_name?, level_name_override?, range_required? }` | La ubicación modificada. |
| `POST /locations/:locationId/move` | `{ parent_location_id, position? }` | La ubicación en su nuevo lugar. `parent_location_id: null` la convierte en raíz. |
| `DELETE /locations/:locationId` | — | **204**. Elimina también todo su subárbol. |

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

### Cuándo se rechaza un cambio

| Situación | Respuesta |
|---|---|
| El esquema está publicado (cualquier cambio, incluido su nombre) | **409** |
| Crear, mover o eliminar ubicaciones si alguna tiene rango ([0001 §4](decisions/0001-ubicaciones-y-mapas.md#4-el-árbol-queda-fijo-mientras-haya-rangos)) | **409** |
| El padre no pertenece al esquema, o se mueve una ubicación dentro de su propio subárbol | **422** |
| Datos con forma incorrecta (campos vacíos, tipos) | **400** |

Con rangos asignados se siguen pudiendo editar nombres y marcas del mínimo.
