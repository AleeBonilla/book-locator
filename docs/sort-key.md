# Clave binaria de ordenamiento

**Versión 1.0.0**

Este documento define cómo se convierte una estructura válida de [`normalization.md`](normalization.md) en una clave que PostgreSQL puede comparar directamente, con el mismo resultado que las reglas de [`classification-ordering.md`](classification-ordering.md). La implementación está en `packages/classification/src/sort-key.ts`.

## 1. Por qué una clave binaria

Las reglas de ordenamiento comparan cada componente con un criterio distinto: letras sin distinguir mayúsculas, cifras del DDC y del Cutter dígito a dígito, cifras de la edición por valor numérico. Ningún tipo nativo de PostgreSQL compara así un texto, y una comparación de `TEXT` depende además de la intercalación (*collation*) del servidor.

Por eso el backend traduce cada código a una secuencia de bytes construida de forma que **el orden byte a byte de las claves sea el orden de los códigos**. PostgreSQL compara valores `BYTEA` byte a byte, como números sin signo y sin intercalación; si una clave es prefijo de otra, la más corta va primero. Con eso:

- `<`, `=`, `>`, `BETWEEN`, `ORDER BY`, `min` y `max` sobre la clave dan el orden del documento;
- un índice B-tree sobre la columna acelera las búsquedas por rango;
- la base no necesita funciones propias ni conocer las reglas.

Dos códigos equivalentes para el orden ([ordenamiento, sección 9](classification-ordering.md#9-equivalencia-para-el-orden)) tienen exactamente la misma clave. Un código inválido no tiene clave.

## 2. Formato

La clave es la concatenación de los componentes en el orden de precedencia. Cada componente de longitud variable termina en `00`, que es menor que cualquier byte de contenido; así, una secuencia que es prefijo de otra queda antes, y un componente ausente (secuencia vacía) queda antes que uno presente.

| Componente | Bytes |
|---|---|
| Prefijo | Cada letra como su rango, después `00`. |
| DDC | Cada dígito en ASCII (`0` = `30` … `9` = `39`), sin el punto, después `00`. |
| Letras del Cutter | Cada letra como su rango, después `00`. |
| Cifras del Cutter | Cada dígito en ASCII, después `00`. |
| Edición | Por cada segmento, `01` seguido de su contenido; al final, `00`. |

**Rango de una letra.** `a` = `01`, …, `n` = `0e`, `ñ` = `0f`, `o` = `10`, …, `z` = `1b`. Mayúsculas y minúsculas tienen el mismo rango, y las vocales con tilde o diéresis el de su vocal base.

**DDC.** Los tres primeros dígitos siempre existen, así que basta quitar el punto: comparar los dígitos de izquierda a derecha es el orden notacional ([ordenamiento, sección 6](classification-ordering.md#6-número-de-clase-ddc)).

**Segmentos de la edición.** Los de letras se codifican como las letras del Cutter (rangos y `00`). Los de dígitos se comparan por valor: se quitan los ceros a la izquierda y se escribe primero la cantidad de cifras (un byte) y después las cifras en ASCII. Un número con más cifras es mayor, y a igual cantidad decide la primera cifra distinta; por eso `6` (`01 36`) < `10` (`02 31 30`). Como la edición siempre alterna letras y dígitos empezando por letras, en la misma posición de dos claves hay siempre segmentos de la misma clase.

El marcador `01` antes de cada segmento y el `00` final hacen que una edición que es prefijo de otra quede antes (`H477a < H477a11`).

## 3. Ejemplos

```text
658            00 | 36 35 38 00 | 00 | 00 | 00
658 H477       00 | 36 35 38 00 | 08 00 | 34 37 37 00 | 00
658 H477a11    00 | 36 35 38 00 | 08 00 | 34 37 37 00 | 01 01 00  01 02 31 31  00
CR863 D633e4   03 13 00 | 38 36 33 00 | 04 00 | 36 33 33 00 | 01 05 00  01 01 34  00
658.8 Ñ372     00 | 36 35 38 38 00 | 0f 00 | 33 37 32 00 | 00
```

Las barras separan los componentes solo para leerlos; la clave no las contiene. `658` queda antes que `658 H477` porque en la sexta posición `00` (sin Cutter) < `08` (`H`), y `658 H477` antes que `658 H477a11` porque al final `00` (sin edición) < `01` (comienza un segmento).

## 4. Uso en la base de datos

Las columnas `locations.range_start_key` y `locations.range_end_key` guardan las claves del inicio y del fin de cada rango, calculadas desde `range_start_raw` y `range_end_raw`. Ambos extremos son inclusivos. Para saber si un código está dentro de un rango, el backend calcula su clave y la compara:

```sql
SELECT location_id
  FROM locations
 WHERE scheme_id = $1
   AND range_start_key <= $2
   AND $2 <= range_end_key;
```

`$2` es la clave del código buscado, que `pg` envía como `Buffer`. La restricción `locations_range_complete` ya exige `range_start_key <= range_end_key`, es decir, que el inicio no esté después del fin según estas reglas.

La clave no se edita a mano ni se calcula en SQL. Si cambian las reglas de normalización, de ordenamiento o este formato, todas las claves se recalculan desde el texto original (`*_raw`), como establece la [decisión 0001](decisions/0001-ubicaciones-y-mapas.md).

## 5. Verificación

`packages/classification/src/compare.test.ts` comprueba que, para todos los pares de una muestra variada de códigos, el signo de `Buffer.compare` entre sus claves coincide con el de la comparación directa de las reglas (`compare.ts`), y que se cumplen los casos de referencia de [ordenamiento, sección 10](classification-ordering.md#10-casos-de-referencia).

Al crear este formato también se comprobó con PostgreSQL 16: las 3 064 claves de los códigos válidos del inventario de estantes, ordenadas con `ORDER BY key`, quedaron exactamente en el mismo orden que con `compare.ts`.
