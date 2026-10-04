# Normalización de códigos de clasificación bibliográficos

**Versión 1.1.0**

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

En la implementación (`apps/api/src/classification/normalize.ts`) los campos se llaman `prefix`, `ddc`, `cutterLetters`, `cutterDigits` y `edition`.

Los únicos estados son `válido` e `inválido`, definidos en la sección 5. El Cutter es opcional: cuando falta, `cutter_letras` y `cutter_cifras` son cadenas vacías y `edicion` es una lista vacía. Una edición requiere un Cutter.

Los cinco campos representan cuatro componentes: prefijo, DDC, Cutter y edición. Las cifras se conservan como cadenas, incluidos sus ceros; su interpretación al comparar pertenece al documento de ordenamiento.

**Letras.** Son letras las del alfabeto latino básico (`A`–`Z`), la `Ñ` y las vocales con tilde o diéresis (`Á É Í Ó Ú Ü`), en mayúscula o minúscula. Cualquier otro carácter fuera de los previstos en la sección 4 hace inválida la entrada.

**Ejemplo.**

```text
entrada:  "001.4 B268-i-2"
salida:   prefijo="", ddc="001.4", cutter_letras="B", cutter_cifras="268",
          edicion=["i", "2"], estado=válido
```

## 3. Principios

1. El texto original se conserva sin cambios. La normalización genera una representación adicional.
2. Solo se elimina lo que no interviene en el orden, y toda eliminación debe estar prevista en una regla de este documento.
3. Las variaciones previstas se corrigen mediante las reglas de la sección 4. Si el resultado no cumple la estructura, la entrada es `inválida`; no se descartan bloques desconocidos ni se completan datos ausentes. El punto del DDC no es un dato sino una ayuda de lectura ([ordenamiento, sección 6](classification-ordering.md#6-número-de-clase-ddc)); por eso puede insertarse (4.6) sin violar este principio.

## 4. Procedimiento

Los pasos se aplican en el orden indicado. En particular, los fragmentos del DDC se reúnen antes de normalizar sus puntos.

### 4.1 Limpieza inicial

Se convierte el texto a la forma Unicode NFC, se eliminan los espacios al principio y al final y se reduce cada secuencia de espacios en blanco a un solo espacio. Una entrada vacía, nula o sin dígitos es `inválida`.

### 4.2 Eliminación de guiones

Se eliminan todos los guiones sin sustituirlos por espacios ni otros caracteres.

```text
B268-i-2  ->  B268i2
O-66f     ->  O66f
I-597c    ->  I597c
```

El guion facilita la lectura, pero no delimita componentes. Puede aparecer entre las cifras del Cutter y la edición, o dentro del Cutter, entre sus letras y sus cifras. Los componentes se delimitan en el paso 4.5.

Un guion entre dos dígitos hace `inválida` la entrada. En el inventario aparece cuando falta la parte alfabética del Cutter (`004.0195-236-i^2`, `664.815-211p`); eliminarlo uniría esas cifras al DDC y produciría un código válido pero falso.

### 4.3 Superíndices

Un número escrito como superíndice es un segmento numérico de la edición. Se admiten dos escrituras, que se sustituyen por los mismos dígitos en línea:

```text
H557m^4    ->  H557m4
F383e⁶     ->  F383e6
k87fu¹³    ->  k87fu13
```

- `^` seguido de uno o más dígitos;
- dígitos Unicode en superíndice (`⁰ ¹ ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹`).

El superíndice debe seguir inmediatamente a una letra. Si sigue a un dígito (`Q699⁴`) o a otro carácter, la entrada es `inválida`, porque se mezclaría con las cifras del Cutter. Un `^` sin dígitos a continuación también la invalida.

### 4.4 Reconstrucción de bloques separados por espacios

**DDC fragmentado.** Si el primer bloque contiene solo el prefijo opcional y el comienzo del DDC (letras seguidas de dígitos, puntos o comas, sin nada después), se le concatenan los bloques consecutivos compuestos solo por dígitos, puntos o comas. Cada fragmento debe contener al menos un dígito. La reconstrucción termina ante el primer bloque que no cumple estas condiciones o al final de la entrada.

```text
341.485 2 I97c  ->  341.4852 I97c
658. 8 S357m   ->  658.8 S357m
658 8 S357m    ->  6588 S357m     (el punto se inserta en 4.6)
341.485 2      ->  341.4852
```

Si el primer bloque ya contiene el Cutter, no se le une ningún bloque numérico. Los bloques numéricos posteriores al Cutter no se incorporan al DDC.

**Edición separada.** Si lo que sigue al DDC son exactamente dos partes, la primera es un Cutter completo sin edición (letras seguidas de dígitos) y la segunda contiene solo letras, se unen ambas. La primera parte puede estar pegada al DDC o en un bloque propio.

```text
669 C146 p     ->  669 C146p
669C146 p      ->  669C146p
972.86 I584 -i ->  972.86 I584i
```

Las demás separaciones no se reparan. Por ejemplo, `392.37 C659ci C659ci`, `371.4 M M423t`, `330 R829i 18` y `CR863D633-l^2 2025` son entradas inválidas. No se eliminan duplicados ni se concatenan indiscriminadamente todos los bloques.

### 4.5 División en componentes

Después de los pasos anteriores, el código debe tener una de estas formas:

- un solo bloque con el prefijo, el DDC y, opcionalmente, el Cutter y la edición, escritos sin espacio (`001.42A543c`, `Cr8615Ch512F2024`, `658`);
- dos bloques: el prefijo con el DDC, y el Cutter con la edición (`001.4 B268i2`).

Cualquier otra cantidad de bloques es inválida.

**Prefijo y DDC.** Las letras iniciales del primer bloque, si las hay, forman el prefijo. La secuencia siguiente de dígitos, puntos y comas es el texto del DDC, que se normaliza en 4.6. Si el bloque empieza con un dígito, el prefijo queda vacío. Si el bloque empieza con otro carácter, o con letras que no van seguidas de dígitos, la entrada es inválida.

**Cutter y edición.** Lo que sigue al DDC (en el mismo bloque o en el segundo) se divide en secuencias alternas de letras y dígitos. La primera secuencia de letras y la primera de dígitos forman el Cutter. Las secuencias restantes forman los segmentos de la edición, en el mismo orden en que aparecen. La edición comienza por letras y alterna segmentos de letras y dígitos. Si no queda nada después del DDC, el código no tiene Cutter.

```text
H477a11   ->  H | 477 | a | 11    ->  Cutter H477,  edición ["a", "11"]
O66f      ->  O | 66  | f         ->  Cutter O66,   edición ["f"]
I597c     ->  I | 597 | c         ->  Cutter I597,  edición ["c"]
S248      ->  S | 248             ->  Cutter S248,  edición []
G216ci43  ->  G | 216 | ci | 43   ->  Cutter G216,  edición ["ci", "43"]
Ch431m    ->  Ch | 431 | m        ->  Cutter Ch431, edición ["m"]
```

```text
001.42A543c        ->  prefijo "",   DDC 001.42,  Cutter A543,   edición ["c"]
Cr8615Ch512F2024   ->  prefijo "Cr", DDC 8615,    Cutter Ch512,  edición ["F", "2024"]
004.N822c          ->  prefijo "",   DDC 004.,    Cutter N822,   edición ["c"]
```

Los dígrafos `Ch` y `Ll` permanecen en una misma secuencia de letras. La salida conserva las mayúsculas, minúsculas y tildes de cada componente; el criterio para compararlas pertenece al documento de ordenamiento.

### 4.6 Normalización del número DDC

Sobre el texto del DDC obtenido en 4.5:

1. Se sustituye la coma decimal por un punto.
2. Se conserva el primer punto y se eliminan los demás.
3. Se elimina el punto final si no tiene dígitos a su derecha.
4. Si no queda ningún punto y hay más de tres dígitos, se inserta un punto después del tercero.

```text
352,85               ->  352.85
303.440.972.862.021  ->  303.440972862021
658.                 ->  658
004.  (de 004.N822c) ->  004
97286                ->  972.86
6588  (de 658 8)     ->  658.8
```

La eliminación de los puntos adicionales conserva la secuencia de dígitos y elimina la agrupación visual. El significado del punto y el criterio de comparación del DDC se definen en [ordenamiento, sección 6](classification-ordering.md#6-número-de-clase-ddc).

El punto solo se inserta cuando falta por completo. Un punto escrito en otra posición no se mueve: `8693.7` y `33.72` siguen siendo inválidos, porque no hay forma de saber si el error está en el punto o en los dígitos.

La escritura con puntos múltiples también se verificó en el catálogo público, donde aparece el código `303.440.972.862.021`.

### 4.7 Validación de la estructura

Una salida es `válida` si cumple todas estas condiciones:

1. El número DDC contiene exactamente tres dígitos iniciales y, opcionalmente, un punto seguido de uno o más dígitos. No contiene otros caracteres.
2. El prefijo, si existe, contiene solo letras y está unido al número DDC sin espacio.
3. El Cutter, si existe, contiene solo letras y dígitos y comienza con una secuencia de letras seguida de una secuencia de dígitos.
4. Si falta el Cutter, ambos campos del Cutter están vacíos y la edición es `[]`.
5. Todo el texto resultante queda representado en los campos; no quedan bloques ni caracteres sin consumir.

## 5. Estados de salida

**`válido`.** Después de aplicar las reglas de normalización, cumple las condiciones de la sección 4.7. Devuelve los cinco campos y puede pasar al ordenamiento. Incluye los códigos sin Cutter y las entradas recuperadas mediante la reconstrucción de bloques.

**`inválido`.** No puede convertirse en la estructura definida mediante las reglas de este documento. Devuelve el estado y un motivo de rechazo, sin estructura comparable; se registra para corrección y queda excluido del ordenamiento.

| Condición | Ejemplo |
|---|---|
| Entrada vacía, nula o sin dígitos | `""`, `null`, `ABC`, `VACIO` |
| DDC con menos o más de tres dígitos iniciales | `86 M378a`, `8693.7 M378a`, `33.72M665g` |
| Bloque final sin Cutter completo | `669 p`, `658.7875796c` |
| Guion entre dígitos | `004.0195-236-i^2` |
| Superíndice que no sigue a una letra, o `^` sin dígitos | `664.Q699⁴`, `330 R829i^` |
| Bloques adicionales no cubiertos por la reconstrucción | `392.37 C659ci C659ci`, `371.4 M M423t` |
| Bloque numérico separado después del Cutter | `330 R829i 18`, `CR863D633-l^2 2025` |
| Caracteres no admitidos en los componentes | `669 C146/p`, `Cr863D633.o` |

El texto original se conserva tanto para las entradas válidas como para las inválidas. La ausencia de Cutter no es un error; la presencia de un bloque final mal formado sí lo es.

Los datos ajenos a los cuatro componentes, como la edición de las tablas DDC, el volumen o el ejemplar, deben guardarse en sus propios campos del catálogo. No se interpretan como componentes adicionales. La cantidad de bloques de la entrada no determina por sí sola su estado: primero se aplican las reglas de reconstrucción de la sección 4.4.

La normalización no detecta todos los errores de captura. Un código al que le falta la letra del Cutter puede tener otra letra que la sustituya (`005.5695-i6` se lee como Cutter `i6`); esos casos son válidos para este procedimiento y solo una revisión humana los distingue.

## 6. Variaciones de escritura observadas

### 6.1 Exportación del catálogo

Las siguientes frecuencias proceden de una exportación de un catálogo de prueba con 10 071 registros y 6 222 códigos distintos. Indican cuántos códigos afecta cada regla; no se utilizan para definirla. La columna «Origen» señala si la variación también se verificó en el catálogo público.

| Variación | Códigos distintos | Regla | Origen |
|---|---|---|---|
| Guion en cualquier posición | 879 | 4.2 | exportación y catálogo |
| De ellos, con guion dentro del Cutter | 321 | 4.2 | exportación y catálogo |
| Puntos múltiples en el DDC | 17 | 4.6 | exportación y catálogo |
| Coma decimal | 2 | 4.6 | solo exportación |
| Punto final sin dígitos a la derecha | 2 | 4.6 | solo exportación |
| Entradas señaladas para revisión en el análisis original | 11 | 4.4 y 5 | solo exportación |

Las 11 entradas señaladas son un recuento histórico anterior a las reglas de recuperación de esta versión; no representan el total actual de entradas inválidas. Ese total requiere volver a evaluar la exportación.

Al eliminar los puntos adicionales, ocho de los diecisiete códigos con puntos múltiples coinciden con códigos que ya estaban escritos sin esos puntos en el catálogo. Además, cuatro pares de códigos coinciden después de eliminar los guiones y corresponden al mismo material. Estos resultados confirman que las diferencias se deben a la captura del texto y no a distinciones bibliográficas.

### 6.2 Inventario de estantes

El inventario de rangos por estante (`Clasificacion BJFF.xlsx`, 1 595 filas con inicio y fin, 3 190 códigos) se escribió con convenciones distintas a las del catálogo. Las reglas 4.3, 4.5 y el paso 4 de 4.6 se agregaron en la versión 1.1.0 para estas formas.

| Variación | Códigos | Regla |
|---|---|---|
| Sin espacio entre el DDC y el Cutter (`001.42A543c`) | 3 154 | 4.5 |
| DDC sin punto (`97286O13c`) | 1 588 | 4.6 |
| Edición con `^` (`H557m^4`) | 689 | 4.3 |
| Guion en cualquier posición | 402 | 4.2 |
| Punto final pegado al Cutter (`004.N822c`) | 59 | 4.5 y 4.6 |
| Edición con superíndice Unicode (`F383e⁶`) | 33 | 4.3 |
| Coma decimal | 5 | 4.6 |

Con la versión 1.1.0, 3 064 códigos son válidos y 126 inválidos. De los inválidos, 93 no tienen la parte alfabética del Cutter (`006.35721v`), 24 tienen un guion entre dígitos, 4 tienen un DDC sin tres dígitos iniciales, 2 son `VACIO` y 3 tienen otros errores de una sola aparición.

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
| `658 8 S357m` | `—` / `658.8` / `S` / `357` / `["m"]` | válido |
| `669 p` | — | inválido |
| `669 C146/p` | — | inválido |
| `86 M378a` | — | inválido |
| `""`, `null`, `ABC` | — | inválido |
| `001.42A543c` | `—` / `001.42` / `A` / `543` / `["c"]` | válido |
| `Cr8615Ch512F2024` | `Cr` / `861.5` / `Ch` / `512` / `["F","2024"]` | válido |
| `669C146 p` | `—` / `669` / `C` / `146` / `["p"]` | válido |
| `97286O13c` | `—` / `972.86` / `O` / `13` / `["c"]` | válido |
| `004.N822c` | `—` / `004` / `N` / `822` / `["c"]` | válido |
| `004,22H515c^3` | `—` / `004.22` / `H` / `515` / `["c","3"]` | válido |
| `658.8F383e⁶` | `—` / `658.8` / `F` / `383` / `["e","6"]` | válido |
| `6584038Ñ372m^13` | `—` / `658.4038` / `Ñ` / `372` / `["m","13"]` | válido |
| `004.0195-236-i^2` | — | inválido |
| `658.7875796c` | — | inválido |
| `664.Q699⁴` | — | inválido |
| `CR863D633-l^2 2025` | — | inválido |
| `Cr863D633.o` | — | inválido |
| `33.72M665g` | — | inválido |

Estos casos se verifican en `apps/api/src/classification/normalize.test.ts`.

## 8. Criterios de conformidad

Una implementación cumple este documento si:

1. Reproduce todos los casos de la sección 7, con solo los estados `válido` e `inválido`.
2. Aplica los pasos de la sección 4 en el orden indicado, incluida la reconstrucción del DDC antes de normalizar sus puntos.
3. Conserva el texto original del código sin cambios.
4. Solo transforma, elimina o inserta caracteres cuando una regla de la sección 4 lo permite.
5. Acepta el Cutter ausente y rechaza los bloques finales mal formados o no consumidos.
6. Produce exactamente los campos de la sección 2 para las entradas válidas y un motivo de rechazo sin estructura comparable para las inválidas.
7. Deja la precedencia, la comparación de valores y la equivalencia para el orden a [`classification-ordering.md`](classification-ordering.md).

## 9. Cambios

**1.1.0**

- Se aceptan las formas del inventario de estantes: Cutter sin espacio después del DDC (4.5), DDC sin punto (4.6, paso 4), punto final pegado al Cutter (4.5 y 4.6) y edición en superíndice (4.3).
- Un guion entre dígitos invalida la entrada (4.2).
- Se definen las letras admitidas, incluidas la `Ñ` y las vocales con tilde (2).
- `658 8 S357m` pasa a ser válido (`658.8`), como consecuencia de insertar el punto ausente.
- Se renumeran los pasos: la división en componentes (4.5) precede a la normalización del DDC (4.6), porque sin espacios solo se sabe dónde termina el DDC al encontrar la primera letra.
