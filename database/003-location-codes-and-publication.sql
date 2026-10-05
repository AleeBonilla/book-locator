BEGIN;

-- =========================================================
-- LOCATIONS: MÍNIMO DE ASIGNACIÓN (decisión 0003 §2)
-- =========================================================

-- Ubicaciones cuyo rango es obligatorio para publicar. La cobertura (una sola
-- marca en cada camino de la raíz a una hoja) la verifica el backend al
-- calcular el estado del esquema.
ALTER TABLE locations
  ADD COLUMN range_required BOOLEAN NOT NULL DEFAULT false;


-- =========================================================
-- LOCATIONS: CÓDIGOS AUTOGENERADOS (decisión 0003 §1)
-- =========================================================

-- El formato hace redundante la comprobación de código en blanco.
ALTER TABLE locations
  DROP CONSTRAINT locations_code_not_blank;

-- Las raíces están en el nivel 1, y solo ellas.
ALTER TABLE locations
  ADD CONSTRAINT locations_root_level
    CHECK ((parent_location_id IS NULL) = (level = 1));

-- code = sort_order de cada ancestro y de la propia ubicación, separados por
-- guiones (p. ej. "6-1-10"): enteros positivos sin ceros a la izquierda, uno
-- por nivel, y el último igual a sort_order. Que el resto coincida con el
-- código del padre lo garantiza el backend, que genera los códigos.
ALTER TABLE locations
  ADD CONSTRAINT locations_code_format
    CHECK (code ~ '^[1-9][0-9]*(-[1-9][0-9]*)*$'),

  ADD CONSTRAINT locations_code_matches_position
    CHECK (
      cardinality(string_to_array(code, '-')) = level
      AND split_part(code, '-', level) = sort_order::text
    );

-- Al reordenar hermanos o mover una ubicación, los códigos de los subárboles
-- afectados cambian a la vez y pueden coincidir temporalmente. Una restricción
-- UNIQUE no diferible se comprueba fila por fila y rechazaría incluso un
-- intercambio hecho en un solo UPDATE; siendo DEFERRABLE, se comprueba al
-- final de cada sentencia y, si el cambio necesita varias sentencias, puede
-- diferirse hasta el COMMIT (SET CONSTRAINTS ... DEFERRED), como
-- locations_sibling_sort_unique.
ALTER TABLE locations
  DROP CONSTRAINT locations_scheme_code_unique,

  ADD CONSTRAINT locations_scheme_code_unique
    UNIQUE (scheme_id, code)
    DEFERRABLE INITIALLY IMMEDIATE;


-- =========================================================
-- SCHEMES: PUBLICACIÓN Y ACTIVACIÓN (decisión 0003 §3 y §4)
-- =========================================================

-- Toda ubicación del mínimo debe estar dibujada, así que no se publica sin
-- plano.
ALTER TABLE schemes
  ADD CONSTRAINT schemes_published_has_map
    CHECK (published_at IS NULL OR map_svg IS NOT NULL);

-- Solo se activa un esquema publicado. Como consecuencia, el esquema activo
-- no se puede despublicar.
ALTER TABLE schemes
  DROP CONSTRAINT schemes_active_valid,

  ADD CONSTRAINT schemes_active_valid
    CHECK (
      NOT is_active
      OR (enabled AND status = 'ASSIGNED' AND published_at IS NOT NULL)
    );

-- A lo sumo un esquema activo: es el que usa la búsqueda pública. Al activar
-- otro, el backend desactiva primero el anterior en la misma transacción.
CREATE UNIQUE INDEX schemes_single_active
  ON schemes ((true))
  WHERE is_active;

COMMIT;
