-- Migration: Add centralized machine key to vendors table
-- Purpose: This allows machines to be managed centrally with a shared key
-- This enables centralized management where multiple machines can be grouped under a single key

-- Add centralized_key column to vendors table
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS centralized_key TEXT;

-- Add index for faster lookups by centralized key
CREATE INDEX IF NOT EXISTS idx_vendors_centralized_key ON vendors(centralized_key);

-- Add comment to document the purpose
COMMENT ON COLUMN vendors.centralized_key IS 'Shared key for centralized machine management';

-- Update the sync_license_activation function to properly handle centralized_key
CREATE OR REPLACE FUNCTION sync_license_activation()
RETURNS TRIGGER AS $$
DECLARE
    v_machine_name TEXT;
    v_centralized_key TEXT;
BEGIN
    -- Only proceed if hardware_id is present (meaning it's an active/linked license)
    IF NEW.hardware_id IS NOT NULL THEN
        
        -- Get the centralized key from the license if it exists
        -- This could be stored in a separate column in the licenses table
        -- For now, we'll use a default centralized key based on vendor_id
        v_centralized_key := COALESCE(NEW.vendor_id, (SELECT vendor_id FROM licenses WHERE license_key = NEW.license_key));

        -- Check if a record in vendors already exists for this hardware_id
        IF EXISTS (SELECT 1 FROM vendors WHERE hardware_id = NEW.hardware_id) THEN
            -- Update existing vendor record
            -- We update vendor_id to match the license owner (if set)
            UPDATE vendors
            SET 
                license_key = NEW.license_key,
                is_licensed = TRUE,
                vendor_id = COALESCE(NEW.vendor_id, vendors.vendor_id),
                centralized_key = COALESCE(v_centralized_key, vendors.centralized_key),
                activated_at = COALESCE(NEW.activated_at, now()),
                status = 'online',
                last_seen = now()
            WHERE hardware_id = NEW.hardware_id;
        ELSE
            -- Create new vendor record
            v_machine_name := 'Machine-' || substring(NEW.hardware_id from 1 for 6);
            
            INSERT INTO vendors (
                hardware_id,
                machine_name,
                license_key,
                is_licensed,
                vendor_id,
                centralized_key,
                activated_at,
                status,
                last_seen
            ) VALUES (
                NEW.hardware_id,
                v_machine_name,
                NEW.license_key,
                TRUE,
                NEW.vendor_id,
                v_centralized_key,
                COALESCE(NEW.activated_at, now()),
                'online',
                now()
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure the trigger is properly set up on the licenses table
DROP TRIGGER IF EXISTS tr_sync_license_activation ON licenses;
CREATE TRIGGER tr_sync_license_activation
AFTER UPDATE ON licenses
FOR EACH ROW
EXECUTE FUNCTION sync_license_activation();