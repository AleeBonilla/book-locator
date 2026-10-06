# Guía para diseñar planos

Esta guía es para quien dibuja el plano de la biblioteca que verá el público al buscar un libro. Explica qué debe contener el archivo, cómo identificar cada mueble y cómo exportarlo. Las reglas técnicas detrás de esta guía están en la [decisión 0003](decisions/0003-codigos-minimo-y-publicacion.md).

## 1. Qué es el plano y para qué se usa

Cuando alguien busca un libro, la aplicación muestra el plano y resalta dónde está, normalmente el mueble. Para eso, cada estructura dibujada tiene que llevar una **etiqueta** con el código que le asignó la aplicación.

La aplicación organiza la biblioteca así:

```text
Fila › Cara › Mueble › Anaquel
```

La aplicación define qué estructuras son **obligatorias** en el plano: las que forman el mínimo de asignación, habitualmente los muebles. **Todas las obligatorias deben estar dibujadas y etiquetadas**, sin excepción; si falta una, el plano no se puede publicar. Podés dibujar además otras estructuras (una cara o una fila completas, por ejemplo), pero no es necesario. Lo que está por debajo de lo dibujado, como los anaqueles, se describe con texto («tercer anaquel de arriba hacia abajo»).

## 2. Cualquier herramienta sirve

Se puede usar Figma, Inkscape, Illustrator, Affinity Designer o cualquier otra herramienta que cumpla dos condiciones:

1. exporta a **SVG**;
2. permite **ponerle nombre a cada objeto**, y ese nombre aparece en el SVG como atributo `id`.

Si tu herramienta no aparece en la sección 6, comprobalo así: exportá un archivo de prueba con un objeto llamado `loc-1-1-1`, abrilo con un editor de texto (Bloc de notas, por ejemplo) y buscá `id="loc-1-1-1"`. Si aparece tal cual, la herramienta sirve.

## 3. Paso a paso

1. **Pedí la hoja de códigos.** La estructura (filas, caras, muebles…) se crea primero en la aplicación, y la aplicación asigna un código a cada ubicación. La hoja se descarga desde la aplicación como planilla y lista, para cada ubicación, el código, la etiqueta que debe llevar su figura, el nombre, la ruta y si es obligatoria:

   ```text
   codigo   etiqueta     nombre      ruta                          obligatoria
   6-1-10   loc-6-1-10   Mueble 10   Fila 6 › Cara 1 › Mueble 10   sí
   ```

   No inventes códigos ni los calcules por tu cuenta: copiá siempre la columna *etiqueta*.

2. **Dibujá el plano.** Podés usar una imagen o un render de fondo y dibujar encima una figura por cada estructura obligatoria, y por las demás que quieras que se puedan resaltar (sección 4).

3. **Etiquetá cada figura** con el nombre `loc-` seguido de su código (sección 5).

4. **Exportá a SVG** (sección 6).

5. **Validá y subí el archivo.** La aplicación permite **validarlo sin guardarlo** y responde con un reporte: contenido no permitido (con la línea del archivo), etiquetas con códigos que no existen, etiquetas mal escritas y estructuras obligatorias sin dibujar. Corregí hasta que no haya errores y subilo.

Si después de recibir la hoja alguien cambia la estructura en la aplicación (agrega, quita o reordena muebles), **los códigos pueden cambiar**. Pedí una hoja nueva y revisá las etiquetas.

## 4. Requisitos del dibujo

**Figuras**

- Una figura por estructura: un rectángulo, un polígono o un trazado cerrado.
- **Con relleno** (aunque sea blanco), porque la aplicación colorea el relleno para resaltar.
- **Por encima** de las imágenes de fondo. Si queda tapada, el resaltado no se ve.
- **De un tamaño razonable.** Como referencia, en el plano de ejemplo, de 1 022 px de ancho, cada mueble mide unos 25 × 15 px. No las hagas más chicas.
- Se puede etiquetar un grupo en lugar de una figura, pero es preferible etiquetar la figura misma.

**Archivo**

- Debe tener `viewBox`; todas las herramientas de la sección 6 lo incluyen por defecto.
- Las imágenes deben estar **incrustadas** en el SVG, no enlazadas a otro archivo o a internet.
- **Tamaño máximo: 5 MB.** Casi todo el peso suele venir de las imágenes de fondo; reducí su resolución o guardalas como JPEG si el archivo se pasa.
- Convertí los textos a contornos o a imagen. Si no, se verán con la tipografía que tenga cada computadora.

**No permitido** (el archivo se rechaza al subirlo):

- scripts, animaciones o atributos de eventos (`onclick`, `onload`…);
- enlaces (`<a>`), y referencias a otras páginas o a recursos externos, incluidas imágenes enlazadas en lugar de incrustadas;
- contenido HTML incrustado (`foreignObject`). Algunas herramientas lo generan para ciertos efectos, como el desenfoque de fondo; si el reporte lo señala, quitá ese efecto.

Estos elementos permitirían ejecutar código en las pantallas de los lectores. Lo habitual en un plano (formas, grupos, imágenes incrustadas, degradados, sombras y otros filtros, textos) está permitido.

## 5. Cómo etiquetar

El **nombre del objeto** en tu herramienta es la etiqueta. Se escribe así:

```text
loc-<código>
```

| Para… | Código en la hoja | Nombre del objeto |
|---|---|---|
| Mueble 10 de la cara 1 de la fila 6 | `6-1-10` | `loc-6-1-10` |
| Toda la cara 2 de la fila 3 | `3-2` | `loc-3-2` |

Reglas:

- **Solo `loc-`, dígitos y guiones**: en minúsculas, sin espacios, sin puntos y sin nada después del código.
- **Sin tildes ni ñ en los nombres de las figuras etiquetadas.** Figma, al menos, exporta mal esos caracteres (un «—» queda como «â» seguido de dos caracteres invisibles). Las etiquetas no los necesitan, porque son solo números.
- **Cada código, una sola vez.** Si duplicás un objeto ya etiquetado, la copia hereda el nombre y la herramienta le agrega algo (`loc-6-1-10 2`, `loc-6-1-10_2`). Renombrala antes de exportar; la aplicación rechaza las etiquetas así.
- Los objetos sin etiqueta (fondos, paredes, textos) pueden llamarse como quieras, mientras no empiecen con `loc-`.
- Toda estructura marcada como obligatoria en la hoja debe tener su figura con su propia etiqueta. No alcanza con dibujar sus partes (los anaqueles de un mueble) ni la estructura que la contiene (la cara).

## 6. Exportar desde cada herramienta

**Figma**

1. Renombrá cada capa con su etiqueta (doble clic en el nombre de la capa).
2. Seleccioná el marco del plano y, en el panel *Export*, elegí **SVG**.
3. En las opciones (`…`), activá **Include "id" attribute**. Sin esta opción el archivo no tendrá etiquetas. Con ella, Figma escribe el nombre de cada capa como su `id`, sin cambios: una capa llamada `loc-6-1-10` queda como `id="loc-6-1-10"` (verificado con el plano de ejemplo).
4. Activá **Outline text** si el plano tiene textos.

**Inkscape**

1. Seleccioná la figura y abrí *Objeto › Propiedades del objeto* (`Ctrl+Mayús+O`).
2. Escribí la etiqueta en el campo **ID** y pulsá *Establecer*. El campo *Etiqueta* no cuenta: tiene que ser **ID**.
3. Guardá con *Guardar como… › SVG simple*. No uses *SVG optimizado*, porque puede borrar o renombrar los `id`.

**Illustrator**

1. Renombrá cada objeto en el panel *Capas*.
2. Usá *Archivo › Exportar › Exportar como… › SVG*.
3. En las opciones, elegí **ID de objeto: Nombres de capa**.

**En cualquier herramienta:** no pases el archivo por optimizadores de SVG (SVGO, SVGOMG u otros). Por defecto acortan o eliminan los `id`, y el plano pierde sus etiquetas.

## 7. Mensajes del reporte

| Mensaje | Qué significa | Qué hacer |
|---|---|---|
| Código inexistente: `loc-6-1-17` | No hay ninguna ubicación con ese código | Revisá la hoja; puede ser un error de tipeo o una hoja vieja |
| Etiqueta mal formada: `loc-6-1-10 2` | El nombre tiene algo más que `loc-` y el código | Renombrá el objeto; suele ser una copia de otro |
| Falta una estructura obligatoria: `loc-4-2-7` (Fila 4 › Cara 2 › Mueble 7) | Esa estructura no tiene figura con su etiqueta | Dibujala y etiquetala; sin ella el plano no se puede publicar |
| Elemento no permitido: `<foreignObject>`, `<script>`, `<a>`… | El archivo tiene HTML incrustado, código, enlaces o animaciones | Quitá el efecto u objeto que lo genera (el reporte indica la línea) y exportá de nuevo |
| Enlace no permitido / `url()` hacia un recurso externo | Una imagen o un estilo apunta a otro archivo o a internet | Incrustá la imagen en lugar de enlazarla |
| El archivo no es un XML válido | El archivo está dañado o incompleto | Exportá de nuevo; no lo edites a mano |
| Falta `viewBox` | La herramienta no lo escribió | Volvé a exportar con las opciones de la sección 6 |
| Archivo demasiado grande | Supera los 5 MB | Reducí o comprimí las imágenes de fondo |
