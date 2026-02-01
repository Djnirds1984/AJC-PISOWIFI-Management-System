-- ============================================
-- NODEMCU LICENSE ASSIGNMENT (SUPERADMIN)
-- ============================================

CREATE OR REPLACE FUNCTION list_vendor_accounts()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  nickname TEXT
) AS $$
DECLARE
  v_is_superadmin BOOLEAN;
BEGIN
  SELECT (role = 'superadmin')
  INTO v_is_superadmin
  FROM user_roles ur_self
  WHERE ur_self.user_id = auth.uid();

  IF v_is_superadmin IS NOT TRUE THEN
    RAISE EXCEPTION 'Only superadmins can list vendor accounts';
  END IF;

  RETURN QUERY
  SELECT sgd.vendor_id AS user_id,
         sgd.vendor_email AS email,
         ur.nickname AS nickname
  FROM superadmin_global_dashboard sgd
  LEFT JOIN user_roles ur
    ON ur.user_id = sgd.vendor_id
  ORDER BY sgd.vendor_email NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION assign_nodemcu_licenses(
  target_vendor_id UUID,
  license_ids UUID[]
)
RETURNS INTEGER AS $$
DECLARE
  v_is_superadmin BOOLEAN;
  v_assigned_count INTEGER;
BEGIN
  SELECT (role = 'superadmin')
  INTO v_is_superadmin
  FROM user_roles ur_self
  WHERE ur_self.user_id = auth.uid();

  IF v_is_superadmin IS NOT TRUE THEN
    RAISE EXCEPTION 'Only superadmins can assign NodeMCU licenses';
  END IF;

  IF target_vendor_id IS NULL THEN
    RAISE EXCEPTION 'target_vendor_id is required';
  END IF;

  IF license_ids IS NULL OR array_length(license_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE nodemcu_licenses
  SET vendor_id = target_vendor_id,
      updated_at = now()
  WHERE id = ANY (license_ids)
    AND vendor_id IS NULL;

  GET DIAGNOSTICS v_assigned_count = ROW_COUNT;
  RETURN v_assigned_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
