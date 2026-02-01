-- Update sync_license_activation to be more robust
-- Remove the strict condition (OLD.hardware_id != NEW.hardware_id)
-- so that ANY update to an active license ensures the machine is synced.
-- Also adds centralized_key functionality

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
        v_centralized_key := NEW.vendor_id;
        
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
