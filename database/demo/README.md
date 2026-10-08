# Datos de demostración

Esquema de la sala general de la BJFF con rangos reales del inventario, limpiados para que se puedan cargar. **Es una demostración:** varios supuestos no están confirmados con la biblioteca.

| Archivo | Contenido |
|---|---|
| `sala-general.json` | Los 316 muebles del plano, con su estante de origen y los rangos de sus anaqueles, ya limpios. |
| `plano-sala-general.svg` | El plano de la sala, con cada mueble etiquetado `loc-<fila>-<cara>-<mueble>` ([guía de mapas](../../docs/guia-mapas.md)). |

Para crear el esquema, publicarlo y ponerlo en uso:

```sh
npm run seed-demo -w api -- --activate            # base local
DATABASE_URL='postgres://…' npm run seed-demo -w api -- --activate   # p. ej. Neon
```

Necesita al menos un usuario (`npm run create-user -w api`): el esquema queda a su nombre. Con `--user <usuario>` se elige cuál, y con `--name` se cambia el nombre del esquema (por defecto, «Sala general (demo)»). Cada ejecución crea un esquema nuevo.

## De dónde salen los datos

El origen es el inventario de estantes `otros/Clasificacion BJFF - corregido.xlsx`, fuera del repositorio. Ese archivo ya integra la hoja de Literatura (estantes 254 a 275) y 354 correcciones confirmadas con el catálogo. La versión limpia, con la lista de cambios, está en `otros/Clasificacion BJFF - demo.xlsx`.

## Supuestos

1. **Estructura.** Es la del plano: Fila (1 a 10) › Cara (1 y 2) › Mueble (1 a 16; 14 en la fila 4) › Anaquel, en total 316 muebles. El mueble es el mínimo para publicar.
2. **Estante → mueble.** El estante 94 está vacío en el inventario y se omite. Los 316 estantes restantes se asignan en orden a los muebles: fila 1 cara 1 muebles 1 a 16, después fila 1 cara 2, y así hasta la fila 10 cara 2. El orden físico real de la numeración puede ser otro.
3. **Anaqueles.** Cada «Fila» del inventario es un anaquel, contando desde arriba. Quince estantes tienen seis anaqueles; el resto, cinco. En total son 1595.
4. **Forma de los códigos.** Lleva espacio entre el DDC y el Cutter, punto decimal donde faltaba, ni `^` ni superíndices, y la inicial del Cutter en mayúscula: `5367C395t^6` pasa a `536.7 C395t6`. Solo se reescribe si el resultado es el mismo código según [normalization.md](../../docs/normalization.md).
5. **Orden.** Se toma la secuencia no decreciente más larga de todos los inicios y finales, en orden físico. Hay 120 códigos (3,8 %) fuera de esa secuencia, que estaban fuera de orden, vacíos o eran inválidos. Se reemplazan así:
   - un inicio, por el código anterior de la secuencia;
   - un final, por el siguiente.

   Así ningún rango queda invertido y la colección se recorre en orden. Estos reemplazos aproximan dónde estaría el libro: no son su ubicación real.
