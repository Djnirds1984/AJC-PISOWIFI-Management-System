-- ============================================
-- REVOKE NODEMCU LICENSE FUNCTION (UPDATED)
-- ============================================
-- This function allows superadmins to revoke an activated NodeMCU license.
-- UPDATED BEHAVIOR:
-- 1. The LICENSE becomes "Available" again (Unbinds from device, resets activation).
-- 2. The DEVICE is NOT blocked (per user request).
-- ============================================

CREATE OR REPLACE FUNCTION revoke_nodemcu_license(p_license_id UUID)
RETURNS VOID AS $$
DECLARE
  v_is_superadmin BOOLEAN;
BEGIN
  -- Check user roles
  SELECT (role = 'superadmin')
  INTO v_is_superadmin
  FROM user_roles
  WHERE user_id = auth.uid();

  IF v_is_superadmin IS NOT TRUE THEN
    RAISE EXCEPTION 'Only superadmins can revoke NodeMCU licenses';
  END IF;

  -- Revoke and Reset the License (Make it Available again)
  UPDATE nodemcu_licenses
  SET 
    is_active = false,
    device_id = NULL,
    mac_address = NULL,
    activated_at = NULL,
    expires_at = NULL, -- Reset expiration so it's valid for reuse
    updated_at = now()
  WHERE id = p_license_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
