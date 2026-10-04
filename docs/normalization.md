# Normalización de códigos de clasificación bibliográficos

**Versión 1.0.0**

Este documento define cómo convertir el texto del catálogo en una estructura comparable por partes. Los criterios para comparar esa estructura se definen en [`classification-ordering.md`](classification-ordering.md).

## 1. Propósito y alcance

Los códigos de clasificación no pueden compararse directamente tal como se escriben en el catálogo. La captura manual introduce variaciones de escritura que no representan diferencias bibliográficas. La normalización separa el texto en componentes y determina si el código puede utilizarse.

Este procedimiento elimina las variaciones de escritura previstas en sus reglas. No ordena los códigos ni determina equivalencias bibliográficas.

## 2. Entrada y salida

**Entrada.** El texto del código tal como aparece en el registro, sin modificar.

**Salida.** Un estado y, cuando este es `válido`, una estructura con cinco campos:

```text
prefijo         cadena de letras, posiblemente vacía
ddc             tres dígitos, opcionalmente seguidos de un punto y más dígitos
cutter_letras   cadena de letras, posiblemente vacía
cutter_cifras   cadena de dígitos, posiblemente vacía
edicion         lista ordenada de segmentos, posiblemente vacía
```

Los únicos estados son `válido` e `inválido`, definidos en la sección 5. El Cutter es opcional: cuando falta, `cutter_letras` y `cutter_cifras` son cadenas vacías y `edicion` es una lista vacía. Una edición requiere un Cutter.

Los cinco campos representan cuatro componentes: prefijo, DDC, Cutter y edición. Las cifras se conservan como cadenas, incluidos sus ceros; su interpretación al comparar pertenece al documento de ordenamiento.

**Ejemplo.**

```text
entrada:  "001.4 B268-i-2"
salida:   prefijo="", ddc="001.4", cutter_letras="B", cutter_cifras="268",
          edicion=["i", "2"], estado=válido
```

## 3. Principios

1. El texto original se conserva sin cambios. La normalización genera una representación adicional.
2. Solo se elimina lo que no interviene en el orden, y toda eliminación debe estar prevista en una regla de este documento.
3. Las variaciones previstas se corrigen mediante las reglas de la sección 4. Si el resultado no cumple la estructura, la entrada es `inválida`; no se descartan bloques desconocidos ni se completan datos ausentes.

## 4. Procedimiento

Los pasos se aplican en el orden indicado. En particular, los fragmentos del DDC se reúnen antes de eliminar un punto final.

### 4.1 Limpieza inicial

Se eliminan los espacios al principio y al final del texto y se reduce cada secuencia de espacios en blanco a un solo espacio. Una entrada vacía, nula o sin dígitos es `inválida`.

### 4.2 Eliminación de guiones

Se eliminan todos los guiones sin sustituirlos por espacios ni otros caracteres.

```text
B268-i-2  ->  B268i2
O-66f     ->  O66f
I-597c    ->  I597c
```

El guion facilita la lectura, pero no delimita componentes. Puede aparecer entre las cifras del Cutter y la edición, o dentro del Cutter, entre sus letras y sus cifras. Los componentes se delimitan en el paso 4.5.

### 4.3 Reconstrucción de bloques separados por espacios

**DDC fragmentado.** A partir del primer bloque, que contiene el prefijo opcional y el comienzo del DDC, se concatenan los bloques consecutivos compuestos solo por dígitos, puntos o comas. Cada fragmento debe contener al menos un dígito. La reconstrucción termina ante el primer bloque que no cumple estas condiciones o al final de la entrada.

```text
341.485 2 I97c  ->  341.4852 I97c
658. 8 S357m   ->  658.8 S357m
341.485 2      ->  341.4852
```

No se inserta un punto que no estuviera en el texto: `658 8 S357m` produce `6588 S357m` y falla la validación. Los bloques numéricos posteriores al Cutter no se incorporan al DDC.

**Edición separada.** Si después del DDC hay exactamente dos bloques, el primero es un Cutter completo sin edición (letras seguidas de dígitos) y el segundo contiene solo letras, se unen ambos. Esta regla se aplica después de eliminar los guiones.

```text
669 C146 p     ->  669 C146p
972.86 I584 -i ->  972.86 I584i
```

Las demás separaciones no se reparan. Por ejemplo, `392.37 C659ci C659ci`, `371.4 M M423t` y `330 R829i 18` son entradas inválidas. No se eliminan duplicados ni se concatenan indiscriminadamente todos los bloques.

### 4.4 Normalización del número DDC

En el primer bloque reconstruido:

1. Se sustituye la coma decimal por un punto.
2. Se conserva el primer punto y se eliminan los demás.
3. Se elimina el punto final si no tiene dígitos a su derecha.

```text
352,85               ->  352.85
303.440.972.862.021  ->  303.440972862021
658.                 ->  658
```

La eliminación de los puntos adicionales conserva la secuencia de dígitos y elimina la agrupación visual. El significado del punto y el criterio de comparación del DDC se definen en [ordenamiento, sección 6](classification-ordering.md#6-número-de-clase-ddc).

Esta forma de escritura también se verificó en el catálogo público, donde aparece el código `303.440.972.862.021`.

### 4.5 División en componentes

Después de los pasos anteriores, el código debe contener uno o dos bloques separados por un espacio. Un solo bloque representa un código sin Cutter ni edición. Cualquier otra cantidad de bloques es inválida.

**Primer bloque.** Las letras iniciales, si las hay, forman el prefijo. El resto corresponde al número DDC. Si el bloque empieza con un dígito, el prefijo queda vacío.

**Segundo bloque, si existe.** Se divide en secuencias alternas de letras y dígitos. La primera secuencia de letras y la primera de dígitos forman el Cutter. Las secuencias restantes forman los segmentos de la edición, en el mismo orden en que aparecen. La edición comienza por letras y alterna segmentos de letras y dígitos.

```text
H477a11   ->  H | 477 | a | 11    ->  Cutter H477,  edición ["a", "11"]
O66f      ->  O | 66  | f         ->  Cutter O66,   edición ["f"]
I597c     ->  I | 597 | c         ->  Cutter I597,  edición ["c"]
S248      ->  S | 248             ->  Cutter S248,  edición []
G216ci43  ->  G | 216 | ci | 43   ->  Cutter G216,  edición ["ci", "43"]
Ch431m    ->  Ch | 431 | m        ->  Cutter Ch431, edición ["m"]
```

Los dígrafos `Ch` y `Ll` permanecen en una misma secuencia de letras. La salida conserva las mayúsculas y minúsculas de cada componente; el criterio para compararlas pertenece al documento de ordenamiento.

### 4.6 Validación de la estructura

Una salida es `válida` si cumple todas estas condiciones:

1. El número DDC contiene exactamente tres dígitos iniciales y, opcionalmente, un punto seguido de uno o más dígitos. No contiene otros caracteres.
2. El prefijo, si existe, contiene solo letras y está unido al número DDC sin espacio.
3. El segundo bloque, si existe, contiene solo letras y dígitos y comienza con una secuencia de letras seguida de una secuencia de dígitos.
4. Si falta el segundo bloque, ambos campos del Cutter están vacíos y la edición es `[]`.
5. Todo el texto resultante queda representado en los campos; no quedan bloques ni caracteres sin consumir.

## 5. Estados de salida

**`válido`.** Después de aplicar las reglas de normalización, cumple las condiciones de la sección 4.6. Devuelve los cinco campos y puede pasar al ordenamiento. Incluye los códigos sin Cutter y las entradas recuperadas mediante la reconstrucción de bloques.

**`inválido`.** No puede convertirse en la estructura definida mediante las reglas de este documento. Devuelve el estado y un motivo de rechazo, sin estructura comparable; se registra para corrección y queda excluido del ordenamiento.

| Condición | Ejemplo |
|---|---|
| Entrada vacía, nula o sin dígitos | `""`, `null`, `ABC` |
| DDC con menos o más de tres dígitos iniciales | `86 M378a`, `8693.7 M378a` |
| Bloque final sin Cutter completo | `669 p` |
| Bloques adicionales no cubiertos por la reconstrucción | `392.37 C659ci C659ci`, `371.4 M M423t` |
| Bloque numérico separado después del Cutter | `330 R829i 18` |
| Caracteres no admitidos en los componentes | `669 C146/p` |

El texto original se conserva tanto para las entradas válidas como para las inválidas. La ausencia de Cutter no es un error; la presencia de un bloque final mal formado sí lo es.

Los datos ajenos a los cuatro componentes, como la edición de las tablas DDC, el volumen o el ejemplar, deben guardarse en sus propios campos del catálogo. No se interpretan como componentes adicionales. La cantidad de bloques de la entrada no determina por sí sola su estado: primero se aplican las reglas de reconstrucción de la sección 4.3.

## 6. Variaciones de escritura observadas

Las siguientes frecuencias proceden de una exportación de un catálogo de prueba con 10 071 registros y 6 222 códigos distintos. Indican cuántos códigos afecta cada regla; no se utilizan para definirla. La columna «Origen» señala si la variación también se verificó en el catálogo público.

| Variación | Códigos distintos | Regla | Origen |
|---|---|---|---|
| Guion en cualquier posición | 879 | 4.2 | exportación y catálogo |
| De ellos, con guion dentro del Cutter | 321 | 4.2 | exportación y catálogo |
| Puntos múltiples en el DDC | 17 | 4.4 | exportación y catálogo |
| Coma decimal | 2 | 4.4 | solo exportación |
| Punto final sin dígitos a la derecha | 2 | 4.4 | solo exportación |
| Entradas señaladas para revisión en el análisis original | 11 | 4.3 y 5 | solo exportación |

Las 11 entradas señaladas son un recuento histórico anterior a las reglas de recuperación de esta versión; no representan el total actual de entradas inválidas. Ese total requiere volver a evaluar la exportación.

Al eliminar los puntos adicionales, ocho de los diecisiete códigos con puntos múltiples coinciden con códigos que ya estaban escritos sin esos puntos en el catálogo. Además, cuatro pares de códigos coinciden después de eliminar los guiones y corresponden al mismo material. Estos resultados confirman que las diferencias se deben a la captura del texto y no a distinciones bibliográficas.

## 7. Casos de referencia

La salida se presenta como `prefijo / ddc / cutter_letras / cutter_cifras / edicion`. Dentro de una salida válida, `—` representa una cadena vacía; una salida completa `—` indica que no se devuelve estructura.

| Entrada | Salida | Estado |
|---|---|---|
| `001.4 B268-i-2` | `—` / `001.4` / `B` / `268` / `["i","2"]` | válido |
| `330 R829i18` | `—` / `330` / `R` / `829` / `["i","18"]` | válido |
| `330 R829-i-3` | `—` / `330` / `R` / `829` / `["i","3"]` | válido |
| `CR863 D633e4` | `CR` / `863` / `D` / `633` / `["e","4"]` | válido |
| `004.0151 S248` | `—` / `004.0151` / `S` / `248` / `[]` | válido |
| `006.6 Ll-791a` | `—` / `006.6` / `Ll` / `791` / `["a"]` | válido |
| `303.440.972.862.021 J61e` | `—` / `303.440972862021` / `J` / `61` / `["e"]` | válido |
| `352,85 G192i` | `—` / `352.85` / `G` / `192` / `["i"]` | válido |
| `392.37 C659ci C659ci` | — | inválido |
| `341.485 2 I-97c` | `—` / `341.4852` / `I` / `97` / `["c"]` | válido |
| `658. 8 S357m` | `—` / `658.8` / `S` / `357` / `["m"]` | válido |
| `669 C146 p` | `—` / `669` / `C` / `146` / `["p"]` | válido |
| `8693.7 M378a` | — | inválido |
| `658` | `—` / `658` / `—` / `—` / `[]` | válido |
| `CR863` | `CR` / `863` / `—` / `—` / `[]` | válido |
| `341.485 2` | `—` / `341.4852` / `—` / `—` / `[]` | válido |
| `658.` | `—` / `658` / `—` / `—` / `[]` | válido |
| `972.86 I584 -i` | `—` / `972.86` / `I` / `584` / `["i"]` | válido |
| `371.4 M M423t` | — | inválido |
| `330 R829i 18` | — | inválido |
| `658 8 S357m` | — | inválido |
| `669 p` | — | inválido |
| `669 C146/p` | — | inválido |
| `86 M378a` | — | inválido |
| `""`, `null`, `ABC` | — | inválido |

## 8. Criterios de conformidad

Una implementación cumple este documento si:

1. Reproduce todos los casos de la sección 7, con solo los estados `válido` e `inválido`.
2. Aplica los pasos de la sección 4 en el orden indicado, incluida la reconstrucción del DDC antes de normalizar sus puntos.
3. Conserva el texto original del código sin cambios.
4. Solo transforma o elimina caracteres cuando una regla de la sección 4 lo permite.
5. Acepta el Cutter ausente y rechaza los bloques finales mal formados o no consumidos.
6. Produce exactamente los campos de la sección 2 para las entradas válidas y un motivo de rechazo sin estructura comparable para las inválidas.
7. Deja la precedencia, la comparación de valores y la equivalencia para el orden a [`classification-ordering.md`](classification-ordering.md).
