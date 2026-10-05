BEGIN;

-- =========================================================
-- LOCATIONS: CÓDIGO COHERENTE CON EL DEL PADRE (decisión 0003 §1)
-- =========================================================

-- Las restricciones CHECK de 003 solo ven la propia fila: garantizan el
-- formato del código y su último segmento, pero no que el resto coincida con
-- el código del padre. Esta comprobación necesita leer otras filas, así que se
-- hace con un trigger.
--
-- Por cada ubicación insertada o modificada se comprueba, con el estado de la
-- tabla al momento de la comprobación:
--   1. que su código sea el de su padre + "-" + sort_order;
--   2. que el código de cada hijo sea el suyo + "-" + sort_order del hijo.
-- El punto 2 detecta un padre cuyo código cambió sin actualizar a sus hijos.
-- Como cada fila modificada se comprueba contra su padre y sus hijos, un
-- subárbol renumerado queda verificado completo. Las raíces no necesitan el
-- punto 1: locations_code_matches_position ya exige code = sort_order.
CREATE FUNCTION locations_check_code_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  loc RECORD;
  related RECORD;
BEGIN
  -- El trigger es diferido: se lee la fila como está al final de la
  -- transacción, no como estaba al modificarla (NEW).
  SELECT location_id, scheme_id, parent_location_id, code, sort_order
    INTO loc
    FROM locations
   WHERE location_id = NEW.location_id;

  IF NOT FOUND THEN
    RETURN NULL; -- eliminada más tarde en la misma transacción
  END IF;

  IF loc.parent_location_id IS NOT NULL THEN
    SELECT p.code
      INTO related
      FROM locations p
     WHERE p.location_id = loc.parent_location_id;

    IF loc.code <> related.code || '-' || loc.sort_order THEN
      RAISE EXCEPTION 'El código % de la ubicación % no corresponde al código de su padre (%)',
        loc.code, loc.location_id, related.code
        USING ERRCODE = 'check_violation',
              CONSTRAINT = 'locations_code_hierarchy';
    END IF;
  END IF;

  SELECT c.location_id, c.code
    INTO related
    FROM locations c
   WHERE c.scheme_id = loc.scheme_id
     AND c.parent_location_id = loc.location_id
     AND c.code <> loc.code || '-' || c.sort_order
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'El código % de la ubicación % no corresponde al código de su padre (%)',
      related.code, related.location_id, loc.code
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'locations_code_hierarchy';
  END IF;

  RETURN NULL;
END;
$$;

-- CONSTRAINT TRIGGER ... INITIALLY DEFERRED: se ejecuta al hacer COMMIT, de
-- modo que el backend puede renumerar un subárbol con varias sentencias y la
-- comprobación ve el resultado final. Fuera de una transacción explícita,
-- cada sentencia es su propia transacción y se comprueba al terminarla.
CREATE CONSTRAINT TRIGGER locations_code_hierarchy
  AFTER INSERT OR UPDATE OF parent_location_id, sort_order, code
  ON locations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION locations_check_code_hierarchy();

COMMIT;
