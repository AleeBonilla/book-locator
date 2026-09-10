# Ordenamiento de códigos de clasificación bibliográficos

**Versión 1.0.0**

## 1. Propósito y alcance

El sistema ordena códigos de clasificación construidos a partir de:

1. un prefijo local **opcional**;
2. un número de clase de la Clasificación Decimal Dewey (DDC);
3. un Cutter **opcional**;
4. una marca de obra **opcional**.

## 2. Contrato de entrada

El ordenamiento recibe dos estructuras válidas producidas según [`normalization.md`](normalization.md), que es la única definición de sus campos, su segmentación y su validación. No recibe texto sin procesar.

Utiliza `prefijo`, `ddc`, `cutter_letras`, `cutter_cifras` y `marca`. El Cutter es opcional; su ausencia se representa según ese contrato. Los ejemplos de este documento muestran códigos o componentes en forma legible para expresar relaciones de orden.

## 3. Convenciones de comparación

El código completo no se compara como una cadena ASCII. Cada componente se compara con su propio criterio y se respeta la precedencia de la sección 4.

Las comparaciones alfabéticas se realizan carácter por carácter y sin distinguir mayúsculas de minúsculas. `Ch` y `Ll` no reciben tratamiento especial. Si una secuencia de letras es prefijo de otra, la más corta se ordena primero.

## 4. Precedencia de comparación

Dos códigos de clasificación se comparan, en este orden, por:

1. presencia de prefijo local;
2. valor del prefijo local;
3. número de clase DDC;
4. presencia de Cutter;
5. parte alfabética del Cutter;
6. cifras del Cutter;
7. presencia y contenido de la marca de obra.

La comparación termina en el primer componente que determina una diferencia.

Cuando un componente opcional se alcanza después de que todos los componentes anteriores resultaron equivalentes, la ausencia del componente se ordena antes que su presencia.

Dos códigos de clasificación cuyos componentes comparables son equivalentes ocupan la misma posición.

## 5. Prefijo local

El prefijo es una convención utilizada para libros de literatura latinoamericana; no forma parte de la notación DDC.

Un código de clasificación sin prefijo se ordena antes que cualquier código con prefijo, con independencia de sus restantes componentes:

```text
999 ... < A863 ...
863 ... < C863 ...
```

Cuando ambos códigos tienen prefijo, se comparan alfabéticamente, carácter por carácter y sin distinguir mayúsculas de minúsculas:

```text
A863 ... < C863 ... < Ch863 ... < CR863 ... < Cu863 ...
cr863 ... = CR863 ...
```

Si un prefijo es prefijo alfabético de otro, el más corto se ordena primero. Un prefijo que termina donde el otro continúa no tiene con qué compararse en esa posición, y la ausencia de carácter precede a cualquier carácter:

```text
C863 ... < Ch863 ...
```

## 6. Número de clase DDC

El número DDC se ordena según su secuencia notacional. Los tres primeros dígitos se comparan como un bloque de anchura fija; los dígitos posteriores al punto se comparan de izquierda a derecha como subdivisiones sucesivas:

```text
004.0151 < 004.1
620 < 620.1
620.1 < 620.106
658 < 658.001
```

El punto que sigue al tercer dígito es una ayuda de lectura, no un punto decimal en sentido matemático. La analogía con una fracción decimal es válida para implementar el orden, pero no redefine la naturaleza de la notación DDC.

Si una secuencia DDC válida es prefijo notacional de otra, la más corta se ordena primero.

El número DDC se compara independientemente de los demás componentes: los espacios, letras o puntuación de otras partes del código de clasificación no alteran este orden.

## 7. Cutter o número de libro

El Cutter solo se compara cuando los prefijos y los números DDC son equivalentes. La ausencia de Cutter precede a su presencia; si ambos están ausentes, los códigos son equivalentes para el orden.

```text
658 < 658 H477
```

La parte alfabética del Cutter se compara primero, alfabéticamente y sin distinguir mayúsculas de minúsculas:

```text
A238 < B415
H477 < S248
```

Las cifras Cutter se comparan dígito por dígito como una fracción decimal, no como un número entero:

```text
S248 < S25
```

porque `.248 < .25`.

Cuando la secuencia de cifras de un Cutter es prefijo de otra, la secuencia más corta se ordena primero:

```text
E43 < E434
K19 < K199
```

La marca de obra del primer código no se compara hasta haber resuelto por completo el Cutter. Por ello:

```text
E43c < E434h
K19m < K199p
```

## 8. Marca de obra

La marca de obra se compara únicamente cuando prefijo, DDC y Cutter son equivalentes.

Se compara **por segmentos**, de izquierda a derecha, utilizando la lista `marca` recibida de normalización. Cada segmento se compara con el de la misma posición del otro código. El contrato de entrada garantiza que esos segmentos son de la misma clase.

**Segmentos de letras.** Se comparan alfabéticamente, carácter por carácter y sin distinguir mayúsculas de minúsculas:

```text
C112c < C112l
K87m14 < K87ma11
S492fs7 = S492Fs7
```

**Segmentos de dígitos.** Se comparan por **valor numérico**, no dígito por dígito:

```text
Ch456q6 < Ch456q10 < Ch456q11
R829i3 < R829i18
H477a11 < H477a12
```

Es la diferencia con las cifras del Cutter, que se leen como fracción decimal. La cifra de la marca de obra representa el número de edición, y una edición es una cantidad: la 6.ª precede a la 10.ª. El criterio sigue la práctica de LC y OCLC para ordinales en signaturas.

**Longitud.** Si la secuencia completa de segmentos de una marca de obra es prefijo de la de otra, la más corta se ordena primero:

```text
H477a < H477a11
```

## 9. Equivalencia para el orden

Dos estructuras son equivalentes para el orden si ningún componente establece una diferencia según los criterios anteriores. Esa equivalencia no demuestra que dos registros correspondan al mismo material bibliográfico.

## 10. Casos de referencia

| Relación esperada | Criterio aplicable |
|---|---|
| `004.0151 < 004.1` | Orden notacional del número DDC |
| `620 < 620.1` | Secuencia DDC más corta como prefijo de otra |
| `620.1 < 620.106` | Secuencia DDC más corta como prefijo de otra |
| `658 < 658.001` | Orden notacional del número DDC |
| `658 < 658 H477` | Ausencia de Cutter antes que presencia |
| `341.485 2 I-97c = 341.4852 I97c` | Misma estructura tras normalización |
| `C112c < C112-l` | Segmentos de letras de la marca tras normalización |
| `A238 < B415` | Parte alfabética del Cutter |
| `S248 < S25` | Cifras del Cutter como fracción decimal |
| `E43c < E434h` | Cifras del Cutter comparadas antes que la marca de obra |
| `K19m < K199p` | Cifras del Cutter comparadas antes que la marca de obra |
| `H477a11 < H477a12` | Contenido de la marca de obra |
| `S492fs7 = S492Fs7` | Marca de obra sin distinguir mayúsculas |
| `Ch456q6 < Ch456q10 < Ch456q11` | Cifras de la marca de obra por valor numérico |
| `R829i3 < R829i18` | Cifras de la marca de obra por valor numérico |
| `K87m14 < K87ma11` | Segmento de letras más corto antes que el más largo |
| `H477a < H477a11` | Marca de obra más corta como prefijo de otra |
| `999 ... < A863 ...` | Ausencia de prefijo antes que presencia |
| `C863 ... < Ch863 ...` | Prefijo más corto antes que el más largo |
| `A863 ... < C863 ... < Ch863 ... < CR863 ... < Cu863 ...` | Comparación alfabética de prefijos |
| `cr863 ... = CR863 ...` | Comparación de prefijos sin distinguir mayúsculas |
| `001.4 B268-i-2 = 001.4 B268i2` | Misma estructura tras normalización |
| `530 O-66f = 530 O66f` | Misma estructura tras normalización |
| `540 S925p2 < 540 S-925t3` | Segmentos de letras de la marca tras normalización |
