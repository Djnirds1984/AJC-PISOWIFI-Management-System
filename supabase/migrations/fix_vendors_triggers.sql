-- Fix triggers on vendors table to prevent "tuple to be updated was already modified" error
-- This error usually happens when a BEFORE trigger executes an UPDATE statement on the same row

-- 1. Re-define the update_updated_at_column function to ensure it uses NEW assignment
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 2. Drop the existing trigger on vendors to be safe
DROP TRIGGER IF EXISTS update_vendors_updated_at ON vendors;

-- 3. Re-create the trigger as a BEFORE trigger (correctly using the function above)
CREATE TRIGGER update_vendors_updated_at 
BEFORE UPDATE ON vendors
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Check for and drop any other potentially problematic triggers on vendors
-- For example, if sync_license_activation was accidentally attached to vendors
DROP TRIGGER IF EXISTS tr_sync_license_activation ON vendors;

-- 5. Ensure sync_license_activation is only on licenses
DROP TRIGGER IF EXISTS tr_sync_license_activation ON licenses;

CREATE TRIGGER tr_sync_license_activation
AFTER UPDATE ON licenses
FOR EACH ROW
EXECUTE FUNCTION sync_license_activation();
