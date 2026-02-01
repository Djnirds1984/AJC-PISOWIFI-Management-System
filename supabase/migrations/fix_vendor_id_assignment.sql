-- Fix vendor_id assignment in sync_license_activation trigger
-- Also fixes existing vendors with NULL vendor_id

-- 1. Fix existing broken records
-- This updates any vendor record that has a NULL vendor_id but is linked to a license with a valid vendor_id
UPDATE vendors v
SET vendor_id = l.vendor_id
FROM licenses l
WHERE v.license_key = l.license_key
AND v.vendor_id IS NULL
AND l.vendor_id IS NOT NULL;

-- 2. Update the trigger function to correctly assign vendor_id
CREATE OR REPLACE FUNCTION sync_license_activation()
RETURNS TRIGGER AS $$
DECLARE
    v_machine_name TEXT;
BEGIN
    -- Only proceed if hardware_id is present (meaning it's an active/linked license)
    IF NEW.hardware_id IS NOT NULL THEN
        
        -- Check if a record in vendors already exists for this hardware_id
        IF EXISTS (SELECT 1 FROM vendors WHERE hardware_id = NEW.hardware_id) THEN
            -- Update existing vendor record
            -- explicitly set vendor_id from the license
            UPDATE vendors
            SET 
                license_key = NEW.license_key,
                is_licensed = TRUE,
                vendor_id = NEW.vendor_id, -- CHANGED: Removed COALESCE to force update from license
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
