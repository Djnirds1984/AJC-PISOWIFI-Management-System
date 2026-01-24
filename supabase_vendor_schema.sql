-- ============================================
-- VENDOR MANAGEMENT SYSTEM - SUPABASE SCHEMA
-- ============================================
-- Run this SQL in your Supabase SQL Editor
-- Project: https://fuiabtdflbodglfexvln.supabase.co
-- ============================================

-- ============================================
-- 1. VENDORS TABLE
-- ============================================
-- Stores information about each PisoWiFi machine
CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Machine Information
  hardware_id TEXT UNIQUE NOT NULL,
  machine_name TEXT NOT NULL,
  location TEXT,
  
  -- License Information
  license_key TEXT REFERENCES licenses(license_key),
  is_licensed BOOLEAN DEFAULT false,
  activated_at TIMESTAMPTZ,
  
  -- Machine Status
  status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'maintenance')),
  last_seen TIMESTAMPTZ DEFAULT now(),
  
  -- Financial Tracking
  coin_slot_pulses INTEGER DEFAULT 0,
  total_revenue DECIMAL(10, 2) DEFAULT 0.00,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Indexes for performance
  CONSTRAINT unique_vendor_hardware UNIQUE(vendor_id, hardware_id)
);

-- Index for fast vendor lookups
CREATE INDEX IF NOT EXISTS idx_vendors_vendor_id ON vendors(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendors_hardware_id ON vendors(hardware_id);
CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(status);

-- ============================================
-- 2. SALES LOGS TABLE
-- ============================================
-- Records every transaction/coin insertion
CREATE TABLE IF NOT EXISTS sales_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  machine_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  
  -- Transaction Details
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'PHP',
  
  -- Session Details
  session_duration INTEGER, -- in seconds
  data_used BIGINT, -- in bytes
  
  -- Customer Information (optional)
  customer_mac TEXT,
  customer_ip TEXT,
  
  -- Metadata
  transaction_type TEXT DEFAULT 'coin_insert' CHECK (transaction_type IN ('coin_insert', 'voucher', 'refund')),
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Notes
  notes TEXT
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_sales_logs_vendor_id ON sales_logs(vendor_id);
CREATE INDEX IF NOT EXISTS idx_sales_logs_machine_id ON sales_logs(machine_id);
CREATE INDEX IF NOT EXISTS idx_sales_logs_created_at ON sales_logs(created_at DESC);

-- ============================================
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on vendors table
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

-- Vendors can view only their own machines
CREATE POLICY "Vendors can view their own machines"
ON vendors FOR SELECT
USING (auth.uid() = vendor_id);

-- Vendors can insert their own machines
CREATE POLICY "Vendors can insert their own machines"
ON vendors FOR INSERT
WITH CHECK (auth.uid() = vendor_id);

-- Vendors can update their own machines
CREATE POLICY "Vendors can update their own machines"
ON vendors FOR UPDATE
USING (auth.uid() = vendor_id)
WITH CHECK (auth.uid() = vendor_id);

-- Vendors can delete their own machines
CREATE POLICY "Vendors can delete their own machines"
ON vendors FOR DELETE
USING (auth.uid() = vendor_id);

-- Enable RLS on sales_logs table
ALTER TABLE sales_logs ENABLE ROW LEVEL SECURITY;

-- Vendors can view only their own sales logs
CREATE POLICY "Vendors can view their own sales"
ON sales_logs FOR SELECT
USING (auth.uid() = vendor_id);

-- Vendors can insert their own sales logs
CREATE POLICY "Vendors can insert their own sales"
ON sales_logs FOR INSERT
WITH CHECK (auth.uid() = vendor_id);

-- Vendors can update their own sales logs
CREATE POLICY "Vendors can update their own sales"
ON sales_logs FOR UPDATE
USING (auth.uid() = vendor_id)
WITH CHECK (auth.uid() = vendor_id);

-- ============================================
-- 4. REALTIME REPLICATION
-- ============================================
-- Enable realtime for live dashboard updates
-- Run these in Supabase Dashboard > Database > Replication

-- ALTER PUBLICATION supabase_realtime ADD TABLE vendors;
-- ALTER PUBLICATION supabase_realtime ADD TABLE sales_logs;

-- Note: You can also enable this in the Supabase Dashboard:
-- Go to Database > Replication > supabase_realtime
-- Enable for: vendors, sales_logs

-- ============================================
-- 5. FUNCTIONS & TRIGGERS
-- ============================================

-- Function to update vendors.updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
CREATE TRIGGER update_vendors_updated_at 
BEFORE UPDATE ON vendors
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically update vendor's total_revenue
CREATE OR REPLACE FUNCTION update_vendor_revenue()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the vendor's total revenue
    UPDATE vendors
    SET total_revenue = total_revenue + NEW.amount
    WHERE id = NEW.machine_id;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update revenue on new sale
CREATE TRIGGER update_revenue_on_sale 
AFTER INSERT ON sales_logs
FOR EACH ROW EXECUTE FUNCTION update_vendor_revenue();

-- ============================================
-- 6. VIEWS FOR ANALYTICS
-- ============================================

-- View: Vendor Dashboard Summary
CREATE OR REPLACE VIEW vendor_dashboard_summary AS
SELECT 
    v.vendor_id,
    COUNT(DISTINCT v.id) as total_machines,
    COUNT(DISTINCT CASE WHEN v.status = 'online' THEN v.id END) as online_machines,
    SUM(v.total_revenue) as total_revenue,
    COUNT(sl.id) as total_transactions,
    SUM(CASE WHEN sl.created_at >= now() - interval '24 hours' THEN sl.amount ELSE 0 END) as revenue_24h,
    SUM(CASE WHEN sl.created_at >= now() - interval '7 days' THEN sl.amount ELSE 0 END) as revenue_7d,
    SUM(CASE WHEN sl.created_at >= now() - interval '30 days' THEN sl.amount ELSE 0 END) as revenue_30d
FROM vendors v
LEFT JOIN sales_logs sl ON sl.machine_id = v.id
GROUP BY v.vendor_id;

-- RLS for the view
ALTER VIEW vendor_dashboard_summary SET (security_invoker = on);

-- ============================================
-- 7. SAMPLE DATA (Optional - for testing)
-- ============================================

-- Insert a test vendor machine (replace with your actual auth.uid())
/*
INSERT INTO vendors (vendor_id, hardware_id, machine_name, location, is_licensed)
VALUES (
    auth.uid(), 
    'CPU-TEST123456789',
    'Test Machine 1',
    'Manila, Philippines',
    true
);

-- Insert test sales logs
INSERT INTO sales_logs (vendor_id, machine_id, amount, session_duration)
SELECT 
    auth.uid(),
    (SELECT id FROM vendors WHERE vendor_id = auth.uid() LIMIT 1),
    5.00,
    300
FROM generate_series(1, 10);
*/

-- ============================================
-- 8. USEFUL QUERIES
-- ============================================

-- Get all machines for current vendor
-- SELECT * FROM vendors WHERE vendor_id = auth.uid();

-- Get today's revenue
-- SELECT SUM(amount) as today_revenue 
-- FROM sales_logs 
-- WHERE vendor_id = auth.uid() 
--   AND created_at >= CURRENT_DATE;

-- Get machine performance
-- SELECT 
--     v.machine_name,
--     v.location,
--     COUNT(sl.id) as transactions,
--     SUM(sl.amount) as revenue
-- FROM vendors v
-- LEFT JOIN sales_logs sl ON sl.machine_id = v.id
-- WHERE v.vendor_id = auth.uid()
-- GROUP BY v.id, v.machine_name, v.location
-- ORDER BY revenue DESC;

-- ============================================
-- SETUP COMPLETE!
-- ============================================
-- Next Steps:
-- 1. Enable Realtime in Supabase Dashboard
-- 2. Configure Google Auth in Authentication > Providers
-- 3. Update your .env with SUPABASE_URL and SUPABASE_ANON_KEY
-- 4. Deploy the vendor dashboard component
-- ============================================
