-- ============================================
-- GENERATE NODEMCU LICENSES FUNCTION
-- ============================================
-- This function allows superadmins to generate NodeMCU license keys.
-- Superadmins can generate any amount for free.
-- Vendors are no longer allowed to generate NodeMCU licenses to preserve credits.
-- ============================================

CREATE OR REPLACE FUNCTION generate_nodemcu_licenses(
  batch_size INTEGER DEFAULT 1,
  assigned_vendor_id UUID DEFAULT NULL,
  expiration_months INTEGER DEFAULT NULL,
  identifier_mark TEXT DEFAULT NULL
)
RETURNS TABLE (
  license_key TEXT,
  expires_at TIMESTAMPTZ
) AS $$
DECLARE
  i INTEGER;
  new_key TEXT;
  exp_date TIMESTAMPTZ;
  v_is_superadmin BOOLEAN;
  v_target_vendor_id UUID;
BEGIN
  -- Check user roles
  SELECT 
    (role = 'superadmin')
  INTO v_is_superadmin
  FROM user_roles
  WHERE user_id = auth.uid();

  -- Security check: Only superadmin
  IF v_is_superadmin IS NOT TRUE THEN
    RAISE EXCEPTION 'Only superadmins can generate NodeMCU license keys';
  END IF;

  -- Superadmin can generate for anyone
  v_target_vendor_id := assigned_vendor_id;

  FOR i IN 1..batch_size LOOP
    -- Generate random license key with MCU prefix
    new_key := 'MCU-' || 
               substring(md5(random()::text || clock_timestamp()::text) from 1 for 8) || '-' ||
               substring(md5(random()::text || clock_timestamp()::text) from 1 for 8);
    
    -- Calculate expiration if specified
    IF expiration_months IS NOT NULL THEN
      exp_date := now() + (expiration_months || ' months')::interval;
    ELSE
      exp_date := NULL;
    END IF;
    
    -- Insert into nodemcu_licenses
    INSERT INTO nodemcu_licenses (
      license_key, 
      vendor_id, 
      created_by, 
      expires_at, 
      notes,
      is_active
    )
    VALUES (
      new_key, 
      v_target_vendor_id, 
      auth.uid(), 
      exp_date, 
      identifier_mark,
      false
    );
    
    -- Set return values
    license_key := new_key;
    expires_at := exp_date;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
