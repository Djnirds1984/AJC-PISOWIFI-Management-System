-- ============================================
-- PREVENT NODEMCU LICENSE REASSIGNMENT
-- ============================================

CREATE OR REPLACE FUNCTION prevent_nodemcu_license_vendor_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.vendor_id IS NOT NULL AND NEW.vendor_id IS DISTINCT FROM OLD.vendor_id THEN
    RAISE EXCEPTION 'NodeMCU license vendor_id is locked once assigned';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


DROP TRIGGER IF EXISTS trg_prevent_nodemcu_license_vendor_change ON nodemcu_licenses;

CREATE TRIGGER trg_prevent_nodemcu_license_vendor_change
BEFORE UPDATE OF vendor_id ON nodemcu_licenses
FOR EACH ROW
EXECUTE FUNCTION prevent_nodemcu_license_vendor_change();

