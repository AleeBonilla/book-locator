# Decisión: asignación de rangos y rangos calculados

- **Estado:** Aceptada
- **Fecha:** 2026-10-05
- **Precisa:** [0001](0001-ubicaciones-y-mapas.md) §2

## Asignar un rango

`PUT /locations/:id/range` recibe `{ start, end }`, el texto de los dos extremos tal como se escribe en el catálogo. Ambos extremos están incluidos en el rango.

1. Cada extremo se normaliza según [`normalization.md`](../normalization.md). Si alguno es inválido, la respuesta es **422** con el motivo de cada uno (`details: [{ path: "start", message: "…" }]`).
2. Se calcula la clave BYTEA de cada extremo ([`sort-key.md`](../sort-key.md)). Si el inicio va después del fin según las [reglas de ordenamiento](../classification-ordering.md), la respuesta es **422**. Esto se decide con las claves, no con el texto: `658 S248 < 658 S25`.
3. Se guarda el texto **sin cambios** en `range_*_raw` y las claves en `range_*_key`.
4. Se actualizan los rangos calculados de los ancestros (siguiente sección) y el estado del esquema.

No se puede asignar rangos en un esquema publicado (**409**). Asignar rangos no es un cambio de estructura: se puede hacer aunque otras ubicaciones ya tengan rango.

## Rangos calculados

**Invariante:** si todos los hijos de una ubicación tienen rango, el rango de la ubicación es el **calculado**: el inicio de su primer hijo y el fin del último, según `sort_order`. Los hijos mandan.

Consecuencias:

- **Al completar los hijos**, el padre recibe el rango calculado, aunque tuviera uno cargado a mano, que se reemplaza. El cálculo sube por los ancestros mientras todos sus hijos tengan rango.
- **Al cambiar el rango de un hijo**, los rangos calculados de sus ancestros se recalculan.
- **Al borrar el rango de un hijo**, el rango del padre deja de valer y se borra; lo mismo ocurre hacia arriba con los ancestros cuyo rango también era calculado.
- **Un rango calculado no se carga ni se borra a mano** (**409**): hay que cambiar el de algún hijo.
- **Un padre con hijos incompletos** puede tener un rango propio, cargado a mano.

No hace falta guardar si un rango es calculado: el invariante permite deducirlo. Si al borrar el rango de un hijo todos los demás tienen rango, entonces antes del borrado estaban completos y el del padre era el calculado.

Si el rango calculado quedara invertido (el primer hijo empieza después de que termina el último), la operación se rechaza con **422** y no se guarda nada. Los rangos de hermanos pueden solaparse o no seguir el orden físico (0001 §2); solo se rechaza el caso en que el rango del padre sería imposible.

## Borrar un rango

`DELETE /locations/:id/range` borra el rango y actualiza los ancestros como se describe arriba. Si la ubicación no tenía rango, no hace nada.
