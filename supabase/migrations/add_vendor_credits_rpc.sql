-- Function to add credits to a vendor
CREATE OR REPLACE FUNCTION add_vendor_credits(
  target_user_id UUID,
  credits_to_add INTEGER
)
RETURNS VOID AS $$
BEGIN
  -- Check if the caller is a superadmin
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'superadmin'
  ) THEN
    RAISE EXCEPTION 'Only superadmins can add credits';
  END IF;

  -- Update the credits in the user_roles table
  UPDATE user_roles
  SET credits = COALESCE(credits, 0) + credits_to_add
  WHERE user_id = target_user_id;

  -- If no row was updated, it might mean the user doesn't have a role yet or isn't a vendor
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User role record not found for the target user';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
