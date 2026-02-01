-- Protect vendor_id and license_key from being overwritten by NULLs
-- This prevents machines (which might not know their owner) from accidentally unclaiming themselves during sync

CREATE OR REPLACE FUNCTION protect_vendor_fields()
RETURNS TRIGGER AS $$
BEGIN
    -- 1. Protect vendor_id
    -- If the record is currently owned (OLD.vendor_id IS NOT NULL)
    -- AND the update tries to set it to NULL (NEW.vendor_id IS NULL)
    -- AND the license is NOT being removed explicitly (NEW.license_key IS NOT NULL)
    IF OLD.vendor_id IS NOT NULL AND NEW.vendor_id IS NULL THEN
        -- If license_key is also being nulled, this might be a legitimate unclaim.
        -- But if license_key is preserved (or changed to another key), we should keep the owner.
        -- If NEW.license_key is NULL, we assume it's a full reset (unclaim).
        -- If NEW.license_key is NOT NULL, we assume it's a sync/heartbeat that missed the vendor_id.
        
        IF NEW.license_key IS NOT NULL THEN
             NEW.vendor_id := OLD.vendor_id;
        END IF;
    END IF;

    -- 2. Protect license_key (Optional, but good for stability)
    -- If the machine has a license, and the update tries to remove it
    -- but doesn't seem to be a deliberate "unclaim" action (e.g. from the dashboard)
    -- This is harder to detect. For now, we trust that if license_key becomes NULL, it's intentional.
    -- However, we can ensure that if license_key IS NOT NULL, we don't lose the vendor_id (handled above).

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS tr_protect_vendor_fields ON vendors;

-- Create the trigger
CREATE TRIGGER tr_protect_vendor_fields
BEFORE UPDATE ON vendors
FOR EACH ROW
EXECUTE FUNCTION protect_vendor_fields();
