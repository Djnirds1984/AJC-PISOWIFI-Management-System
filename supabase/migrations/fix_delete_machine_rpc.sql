-- Create helper function to check if user is superadmin if it doesn't exist
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'superadmin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the function if it exists with the old signature or same signature
DROP FUNCTION IF EXISTS delete_and_reset_machine(text);

-- Function to delete a machine and reset its license
-- This version uses the correct "vendors" table name instead of "machines"
CREATE OR REPLACE FUNCTION delete_and_reset_machine(p_hardware_id TEXT)
RETURNS VOID AS $$
DECLARE
  v_machine_id UUID;
  v_vendor_id UUID;
BEGIN
  -- Get the machine ID and vendor ID from the vendors table
  SELECT id, vendor_id INTO v_machine_id, v_vendor_id
  FROM vendors
  WHERE hardware_id = p_hardware_id;

  -- Check if machine exists
  IF v_machine_id IS NULL THEN
    RAISE EXCEPTION 'Machine not found';
  END IF;

  -- Check if the caller is the owner or superadmin
  -- Note: auth.uid() returns the current user's ID
  IF v_vendor_id IS NOT NULL AND v_vendor_id != auth.uid() AND NOT is_superadmin() THEN
    RAISE EXCEPTION 'Not authorized to delete this machine';
  END IF;

  -- Reset the license associated with this machine
  -- We identify the license by the hardware_id it is bound to
  UPDATE licenses
  SET 
    hardware_id = NULL,
    is_active = false,
    activated_at = NULL
  WHERE hardware_id = p_hardware_id;

  -- Delete the machine from the vendors table
  DELETE FROM vendors
  WHERE id = v_machine_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
