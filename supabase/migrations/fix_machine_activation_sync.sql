-- ============================================
-- FIX MACHINE ACTIVATION SYNC
-- ============================================
-- This migration ensures that:
-- 1. The vendors table allows machines to register themselves (unclaimed).
-- 2. Activation of a license automatically creates/updates a record in the vendors table.
-- ============================================

-- 1. Ensure vendor_id is nullable in the vendors table
ALTER TABLE vendors ALTER COLUMN vendor_id DROP NOT NULL;

-- 2. Update RLS policies for the vendors table
-- Drop existing policies if they might conflict
DROP POLICY IF EXISTS "Vendors can insert their own machines" ON vendors;
DROP POLICY IF EXISTS "Allow machine registration" ON vendors;
DROP POLICY IF EXISTS "Vendors can view unowned machines" ON vendors;

-- Allow machines to register themselves as unclaimed
-- Or allow vendors to insert their own machines
CREATE POLICY "Allow machine registration"
ON vendors FOR INSERT
WITH CHECK (vendor_id IS NULL OR auth.uid() = vendor_id);

-- Ensure vendors can view unowned machines to claim them
CREATE POLICY "Vendors can view unowned machines"
ON vendors FOR SELECT
USING (vendor_id IS NULL);

-- 3. Create a function to sync license activation with the vendors table
CREATE OR REPLACE FUNCTION sync_license_activation()
RETURNS TRIGGER AS $$
DECLARE
    v_machine_name TEXT;
BEGIN
    -- Only proceed if hardware_id has just been set or updated
    IF (NEW.hardware_id IS NOT NULL AND (OLD.hardware_id IS NULL OR OLD.hardware_id != NEW.hardware_id)) THEN
        
        -- Check if a record in vendors already exists for this hardware_id
        IF EXISTS (SELECT 1 FROM vendors WHERE hardware_id = NEW.hardware_id) THEN
            -- Update existing vendor record
            UPDATE vendors
            SET 
                license_key = NEW.license_key,
                is_licensed = TRUE,
                -- If license has a vendor, assign the machine to that vendor
                vendor_id = COALESCE(NEW.vendor_id, vendors.vendor_id),
                activated_at = COALESCE(NEW.activated_at, now()),
                status = 'online',
                last_seen = now()
            WHERE hardware_id = NEW.hardware_id;
        ELSE
            -- Create new vendor record
            -- Use a default name based on hardware ID
            v_machine_name := 'Machine-' || substring(NEW.hardware_id from 1 for 6);
            
            INSERT INTO vendors (
                hardware_id,
                machine_name,
                license_key,
                is_licensed,
                vendor_id,
                activated_at,
                status,
                last_seen
            ) VALUES (
                NEW.hardware_id,
                v_machine_name,
                NEW.license_key,
                TRUE,
                NEW.vendor_id,
                COALESCE(NEW.activated_at, now()),
                'online',
                now()
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create the trigger on the licenses table
DROP TRIGGER IF EXISTS tr_sync_license_activation ON licenses;
CREATE TRIGGER tr_sync_license_activation
AFTER UPDATE ON licenses
FOR EACH ROW
EXECUTE FUNCTION sync_license_activation();
