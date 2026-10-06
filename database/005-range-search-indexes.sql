BEGIN;

-- =========================================================
-- LOCATIONS: ÍNDICES PARA LA BÚSQUEDA POR RANGO
-- =========================================================

-- La búsqueda pública compara la clave del código buscado con los extremos de
-- los rangos del esquema activo (range_start_key <= clave <= range_end_key) y,
-- si cae en un hueco, busca el rango que termina justo antes y el que empieza
-- justo después. Solo interesan las ubicaciones con rango.
CREATE INDEX locations_range_start_key
  ON locations (scheme_id, range_start_key)
  WHERE range_start_key IS NOT NULL;

CREATE INDEX locations_range_end_key
  ON locations (scheme_id, range_end_key)
  WHERE range_end_key IS NOT NULL;

COMMIT;
