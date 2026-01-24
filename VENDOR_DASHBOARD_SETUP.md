# 🏪 Vendor Dashboard Setup Guide

Complete guide for setting up the multi-tenant vendor management dashboard with Google Authentication and real-time updates.

## ✅ What Was Built

A complete multi-tenant vendor management system that allows PisoWiFi vendors to:
- Sign in with Google OAuth
- View all their registered machines
- Monitor real-time machine status (online/offline)
- Track revenue and transactions
- Receive live updates when coins are inserted
- Manage only their own machines (RLS protected)

---

## 📋 Prerequisites

- Supabase project already configured (from previous licensing setup)
- Your Supabase URL and ANON_KEY in `.env` file
- Node.js and npm installed

---

## 🚀 Step-by-Step Setup

### 1. Run the SQL Schema in Supabase

Open your Supabase SQL Editor and run the complete schema from:
**File**: [`supabase_vendor_schema.sql`](file:///c:/Users/AJC/Documents/GitHub/AJC-PISOWIFI-Management-System/supabase_vendor_schema.sql)

This creates:
- `vendors` table (stores machine information)
- `sales_logs` table (tracks transactions)
- `vendor_dashboard_summary` view (analytics)
- Row Level Security policies
- Automatic revenue calculation triggers

```sql
-- Quick verification after running:
SELECT * FROM vendors LIMIT 1;
SELECT * FROM sales_logs LIMIT 1;
```

---

### 2. Enable Realtime Replication

In Supabase Dashboard:

1. Go to **Database** → **Replication**
2. Find **supabase_realtime** publication
3. Click **Edit Publication**
4. Enable tables:
   - ✅ `vendors`
   - ✅ `sales_logs`
5. Click **Save**

**Alternative (SQL)**:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE vendors;
ALTER PUBLICATION supabase_realtime ADD TABLE sales_logs;
```

---

### 3. Configure Google OAuth

In Supabase Dashboard:

1. Go to **Authentication** → **Providers**
2. Find **Google** provider
3. Enable it
4. Configure:

**Google Cloud Console Setup:**

a. Go to https://console.cloud.google.com/apis/credentials

b. Create OAuth 2.0 Client ID:
   - Application type: **Web application**
   - Name: `AJC PisoWiFi Vendor Portal`
   
c. Add Authorized redirect URIs:
   ```
   https://fuiabtdflbodglfexvln.supabase.co/auth/v1/callback
   ```

d. Copy your:
   - **Client ID**
   - **Client Secret**

e. Paste them into Supabase Google Provider settings

f. Click **Save**

---

### 4. Test the Vendor Portal

1. **Start your server**:
   ```bash
   npm start
   ```

2. **Navigate to**:
   ```
   http://localhost/vendor
   ```

3. **Sign in with Google**:
   - Click "Continue with Google"
   - Select your Google account
   - Grant permissions
   - You'll be redirected to the dashboard

---

## 🗂️ File Structure

```
components/Vendor/
├── VendorApp.tsx          # Main vendor app router
├── VendorLogin.tsx        # Google OAuth login page
└── VendorDashboard.tsx    # Multi-tenant dashboard with realtime

lib/
├── supabase-vendor.ts     # Supabase client & utilities
└── ...

types.ts                   # Added vendor types
App.tsx                    # Updated with vendor routes
```

---

## 🔐 How Security Works

### Row Level Security (RLS)

Every vendor can ONLY see their own data:

```sql
-- Example policy
CREATE POLICY "Vendors can view their own machines"
ON vendors FOR SELECT
USING (auth.uid() = vendor_id);
```

When a vendor queries:
```typescript
const { data } = await supabase
  .from('vendors')
  .select('*');
```

Supabase automatically filters to `WHERE vendor_id = auth.uid()`

### Hardware Verification

Only licensed machines show management options:

```typescript
// In VendorDashboard component
const licensedMachines = machines.filter(m => m.is_licensed);
```

The dashboard displays license status for each machine with visual indicators.

---

## 📊 Real-time Updates

The dashboard subscribes to Supabase Realtime channels:

```typescript
// Automatically updates when:
// 1. A machine comes online/offline
// 2. A coin is inserted (new sale)
// 3. Machine status changes
// 4. Revenue updates
```

**How it works:**
1. PisoWiFi machine inserts sale → Supabase
2. Realtime broadcasts to all connected vendors
3. Dashboard updates instantly (no refresh needed)

---

## 🎯 Usage Guide

### For Vendors:

1. **Sign Up**:
   - Visit `/vendor`
   - Sign in with Google
   - Your vendor ID is auto-created

2. **Register a Machine**:
   ```sql
   -- Run in Supabase SQL Editor (or via API)
   INSERT INTO vendors (vendor_id, hardware_id, machine_name, location, is_licensed)
   VALUES (
     auth.uid(),  -- Your vendor ID
     'CPU-0000000012345678',  -- Machine's hardware ID
     'Manila Branch 1',
     'Manila, Philippines',
     true
   );
   ```

3. **View Dashboard**:
   - Total machines count
   - Online machines count
   - Real-time revenue
   - Recent transactions
   - Machine status cards

4. **Monitor Sales**:
   - When someone inserts a coin
   - Transaction appears instantly
   - Revenue counter updates
   - No page refresh needed

---

## 🔌 API Integration

### From PisoWiFi Device

When a coin is inserted, the device should call:

```javascript
// lib/supabase-vendor.ts exports this
import { addSalesLog } from './lib/supabase-vendor';

// When coin detected
await addSalesLog({
  machine_id: 'your-machine-uuid',
  amount: 5.00,
  transaction_type: 'coin_insert',
  session_duration: 300,  // seconds
  customer_mac: 'AA:BB:CC:DD:EE:FF'
});
```

This will:
1. Insert into `sales_logs` table
2. Trigger auto-update of `vendors.total_revenue`
3. Broadcast via Realtime to dashboard
4. Vendor sees update instantly

---

## 📱 Dashboard Features

### Summary Cards
- **Total Machines**: Count of registered devices
- **Online Now**: Currently active machines
- **Total Revenue**: All-time earnings
- **24h Revenue**: Last 24 hours

### Revenue Overview
- Toggle between: 24h / 7d / 30d
- Large display of period revenue
- Auto-updates in real-time

### Machines List
- Machine name & location
- Online/Offline/Maintenance status
- Licensed status badge
- Total revenue per machine
- Hardware ID (truncated)
- Last seen timestamp

### Recent Transactions
- Last 10 sales displayed
- Amount, machine name, time
- Session duration
- Real-time updates as sales occur

---

## 🛠️ Troubleshooting

### "Failed to sign in with Google"

**Solution**: Check your Google OAuth configuration
- Verify redirect URI in Google Cloud Console
- Ensure Client ID and Secret are correct in Supabase
- Make sure Google provider is enabled in Supabase

### "No machines found"

**Solution**: Register a machine
```sql
INSERT INTO vendors (vendor_id, hardware_id, machine_name, is_licensed)
VALUES (auth.uid(), 'CPU-TEST123', 'Test Machine', true);
```

### Realtime not working

**Solution**: Enable Realtime replication
1. Go to Supabase Dashboard → Database → Replication
2. Enable for `vendors` and `sales_logs` tables
3. Restart your app

### RLS blocking queries

**Solution**: Ensure you're authenticated
- Check if Google sign-in was successful
- Verify `auth.uid()` is set
- Check browser console for auth errors

### Dashboard shows "Not authenticated"

**Solution**: Clear browser storage and sign in again
```javascript
localStorage.clear();
// Then refresh and sign in
```

---

## 📡 Testing Real-time Updates

### Test 1: Manual Sales Insert

```sql
-- In Supabase SQL Editor (while dashboard is open)
INSERT INTO sales_logs (vendor_id, machine_id, amount)
VALUES (
  auth.uid(),
  (SELECT id FROM vendors WHERE vendor_id = auth.uid() LIMIT 1),
  5.00
);

-- Watch the dashboard update instantly!
```

### Test 2: Machine Status Update

```sql
-- Change machine status
UPDATE vendors 
SET status = 'online', last_seen = now()
WHERE vendor_id = auth.uid() 
  AND machine_name = 'Your Machine Name';

-- Dashboard should show machine online immediately
```

### Test 3: Multiple Sales

```sql
-- Insert 10 sales rapidly
INSERT INTO sales_logs (vendor_id, machine_id, amount, transaction_type)
SELECT 
  auth.uid(),
  (SELECT id FROM vendors WHERE vendor_id = auth.uid() LIMIT 1),
  5.00,
  'coin_insert'
FROM generate_series(1, 10);

-- Watch revenue counter climb in real-time!
```

---

## 🔄 Integration with Existing System

The vendor dashboard integrates seamlessly with your licensing system:

1. **Licensed Machines**: Only shows machines with `is_licensed = true`
2. **Hardware ID**: Links to `licenses` table via `hardware_id`
3. **Vendor Auth**: Each Google user = unique vendor
4. **Multi-Tenant**: Each vendor sees only their machines

### Link Machine to Vendor

When a license is activated:

```sql
-- After license activation, register machine to vendor
INSERT INTO vendors (vendor_id, hardware_id, machine_name, license_key, is_licensed)
VALUES (
  'vendor-uuid',  -- Vendor's auth.uid()
  'CPU-0000000012345678',  -- From license activation
  'Customer Machine Name',
  'AJC-abc123-def456',  -- The activated license key
  true
);
```

---

## 📊 Sample Dashboard Queries

### Get vendor summary
```typescript
const { summary } = await fetchDashboardSummary();
console.log(summary.total_revenue);
console.log(summary.online_machines);
```

### Get all machines
```typescript
const { machines } = await fetchVendorMachines();
machines.forEach(m => {
  console.log(`${m.machine_name}: ₱${m.total_revenue}`);
});
```

### Get recent sales
```typescript
const { logs } = await fetchSalesLogs({ limit: 10 });
logs.forEach(sale => {
  console.log(`₱${sale.amount} at ${sale.created_at}`);
});
```

---

## 🎨 Customization

### Branding

Edit [`VendorLogin.tsx`](file:///c:/Users/AJC/Documents/GitHub/AJC-PISOWIFI-Management-System/components/Vendor/VendorLogin.tsx):
- Change logo/icon
- Update colors
- Modify text

### Dashboard Layout

Edit [`VendorDashboard.tsx`](file:///c:/Users/AJC/Documents/GitHub/AJC-PISOWIFI-Management-System/components/Vendor/VendorDashboard.tsx):
- Rearrange sections
- Add custom metrics
- Modify stat cards

---

## 🚦 Deployment Checklist

Before deploying to production:

- [x] SQL schema executed in Supabase
- [x] Realtime enabled for vendors & sales_logs
- [x] Google OAuth configured
- [x] Redirect URIs set correctly
- [x] RLS policies tested
- [ ] Add production domain to Google OAuth
- [ ] Update SUPABASE_URL in .env
- [ ] Test with real vendors
- [ ] Setup email notifications (optional)
- [ ] Configure custom domain (optional)

---

## 📞 Support & Resources

- **Supabase Docs**: https://supabase.com/docs
- **Google OAuth Guide**: https://developers.google.com/identity/protocols/oauth2
- **SQL Schema**: [`supabase_vendor_schema.sql`](file:///c:/Users/AJC/Documents/GitHub/AJC-PISOWIFI-Management-System/supabase_vendor_schema.sql)
- **Type Definitions**: [`types.ts`](file:///c:/Users/AJC/Documents/GitHub/AJC-PISOWIFI-Management-System/types.ts)

---

## ✨ Features Summary

✅ Google OAuth authentication  
✅ Multi-tenant architecture (RLS)  
✅ Real-time dashboard updates  
✅ Machine status monitoring  
✅ Revenue tracking (24h/7d/30d)  
✅ Transaction history  
✅ Hardware license verification  
✅ Auto-revenue calculation  
✅ Type-safe TypeScript  
✅ Mobile responsive UI  

---

**System Ready!** 🎉

Navigate to `http://localhost/vendor` and sign in with Google to access your multi-tenant vendor dashboard!
