# Project Separation Guide

## 🎯 Overview

Your AJC PisoWiFi system is now split into **TWO separate projects**:

### 1. **Edge Service** (Orange Pi - Local Hardware)
- **Location**: Current project root (this folder)
- **Runs on**: Orange Pi hardware
- **Purpose**: Hardware control, licensing, data syncing
- **No UI**: Only APIs and background services

### 2. **Vendor Dashboard** (Cloud - Web App)
- **Location**: Separate repository/folder
- **Runs on**: Cloud hosting (Vercel, Netlify, etc.)
- **Purpose**: Multi-tenant vendor management UI
- **Full UI**: React dashboard with authentication

---

## 📂 Current Project (Keep on Orange Pi)

### What STAYS in this project:

```
AJC-PISOWIFI-Management-System/  ← Edge Service
├── lib/
│   ├── gpio.js              ✅ Hardware control
│   ├── network.js           ✅ Network management  
│   ├── hardware.ts          ✅ Hardware ID extraction
│   ├── license.ts           ✅ License validation
│   ├── trial.js             ✅ Trial management
│   ├── auth.js              ✅ Local admin auth
│   └── db.js                ✅ SQLite database
├── server.js                ✅ Express server (captive portal + APIs)
├── components/
│   ├── Portal/              ✅ Customer-facing portal
│   │   ├── LandingPage.tsx  ✅ Coin insertion UI
│   │   └── CoinModal.tsx    ✅ Payment interface
│   └── Admin/               ✅ LOCAL hardware setup only
│       ├── HardwareManager.tsx  ✅ GPIO config
│       ├── NetworkSettings.tsx  ✅ Hotspot setup
│       └── SystemSettings.tsx   ✅ License activation
├── App.tsx                  ✅ Local app router (NO vendor routes)
├── .env                     ✅ Supabase for syncing
└── package.json             ✅ Edge dependencies
```

### What to REMOVE from Orange Pi:

```
❌ components/Vendor/          # Move to cloud dashboard
   ├── VendorApp.tsx
   ├── VendorLogin.tsx
   └── VendorDashboard.tsx

❌ lib/supabase-vendor.ts      # Move to cloud dashboard

❌ Vendor routes in App.tsx    # Remove /vendor paths
```

---

## 🌐 New Project (Cloud Hosted)

### Create a NEW repository: `ajc-vendor-dashboard`

```
ajc-vendor-dashboard/  ← Cloud Dashboard
├── src/
│   ├── components/
│   │   ├── VendorLogin.tsx     # Email/password login
│   │   ├── VendorDashboard.tsx # Main dashboard
│   │   ├── MachineCard.tsx     # Machine status cards
│   │   └── SalesTable.tsx      # Transaction list
│   ├── lib/
│   │   └── supabase.ts         # Supabase client
│   ├── types/
│   │   └── index.ts            # Vendor types
│   ├── App.tsx                 # Dashboard router
│   └── main.tsx                # Entry point
├── public/
├── index.html
├── package.json
├── vite.config.ts
└── .env
    VITE_SUPABASE_URL=https://fuiabtdflbodglfexvln.supabase.co
    VITE_SUPABASE_ANON_KEY=your-key
```

---

## 🔄 How They Work Together

### Architecture:

```
┌─────────────────────────────────────────────────┐
│  Orange Pi (Edge Service)                       │
│  - Coin slot GPIO                               │
│  - Network management                           │
│  - Captive portal                               │
│  - Local SQLite                                 │
│  - License check                                │
│  └─┐                                            │
│    │ Syncs data via Supabase API                │
│    ▼                                             │
└────┼─────────────────────────────────────────────┘
     │
     │ HTTPS
     │
┌────▼─────────────────────────────────────────────┐
│  Supabase Cloud Database                         │
│  - vendors table                                 │
│  - sales_logs table                              │
│  - licenses table                                │
│  - Row Level Security (RLS)                      │
│  - Realtime enabled                              │
└────┬─────────────────────────────────────────────┘
     │
     │ HTTPS + Auth
     │
┌────▼─────────────────────────────────────────────┐
│  Cloud Dashboard (Vendor Web App)                │
│  - Vendor authentication                         │
│  - Fleet management                              │
│  - Revenue analytics                             │
│  - Real-time updates                             │
│  - Machine status                                │
└──────────────────────────────────────────────────┘
```

### Data Flow:

1. **Customer inserts coin** on Orange Pi
2. **Edge Service** creates session locally
3. **Edge Service syncs** to Supabase:
   ```typescript
   await supabase.from('sales_logs').insert({
     vendor_id: MACHINE_VENDOR_ID,
     machine_id: MACHINE_ID,
     amount: 5.00,
     transaction_type: 'coin_insert'
   });
   ```
4. **Supabase Realtime** broadcasts to dashboard
5. **Vendor sees** transaction instantly in cloud dashboard

---

## 🛠️ Step-by-Step Migration

### Step 1: Clean Up Current Project (Orange Pi)

Remove vendor dashboard files:

```bash
# Delete vendor components
rm -rf components/Vendor/

# Remove vendor library
rm lib/supabase-vendor.ts
```

Update `App.tsx` - Remove vendor routes:
```typescript
// REMOVE THIS:
import VendorApp from './components/Vendor/VendorApp';

// REMOVE THIS:
const isVendorPath = () => {
  const path = window.location.pathname.toLowerCase();
  return path.startsWith('/vendor');
};

// REMOVE THIS:
if (isVendorPath()) {
  return <VendorApp />;
}
```

### Step 2: Add Supabase Sync to Edge Service

Create `lib/edge-sync.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// Get machine config from environment
const MACHINE_ID = process.env.MACHINE_ID!;
const VENDOR_ID = process.env.VENDOR_ID!;

export async function syncSaleToCloud(sale: {
  amount: number;
  session_duration?: number;
  customer_mac?: string;
}) {
  try {
    const { error } = await supabase
      .from('sales_logs')
      .insert({
        vendor_id: VENDOR_ID,
        machine_id: MACHINE_ID,
        amount: sale.amount,
        session_duration: sale.session_duration,
        customer_mac: sale.customer_mac,
        transaction_type: 'coin_insert'
      });

    if (error) throw error;
    console.log('[Sync] Sale synced to cloud');
  } catch (err) {
    console.error('[Sync] Failed to sync sale:', err);
    // Store locally for retry later
  }
}

export async function syncMachineStatus(status: 'online' | 'offline') {
  try {
    const { error } = await supabase
      .from('vendors')
      .update({
        status,
        last_seen: new Date().toISOString()
      })
      .eq('id', MACHINE_ID);

    if (error) throw error;
  } catch (err) {
    console.error('[Sync] Failed to sync status:', err);
  }
}

// Heartbeat every 60 seconds
setInterval(() => syncMachineStatus('online'), 60000);
```

In `server.js`, when coin is inserted:
```javascript
const { syncSaleToCloud } = require('./lib/edge-sync.ts');

// After creating local session
await syncSaleToCloud({
  amount: pesos,
  session_duration: seconds,
  customer_mac: mac
});
```

### Step 3: Create Cloud Dashboard Project

```bash
# Create new Vite project
npm create vite@latest ajc-vendor-dashboard -- --template react-ts

cd ajc-vendor-dashboard

# Install dependencies
npm install @supabase/supabase-js

# Copy vendor files from old project
cp -r ../AJC-PISOWIFI-Management-System/components/Vendor/* src/components/
cp ../AJC-PISOWIFI-Management-System/lib/supabase-vendor.ts src/lib/
cp ../AJC-PISOWIFI-Management-System/types.ts src/types/

# Create .env
echo "VITE_SUPABASE_URL=https://fuiabtdflbodglfexvln.supabase.co" > .env.local
echo "VITE_SUPABASE_ANON_KEY=your-key" >> .env.local
```

Update imports to use `VITE_` prefix:
```typescript
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
```

### Step 4: Deploy Dashboard to Cloud

**Option A: Vercel**
```bash
npm install -g vercel
vercel
```

**Option B: Netlify**
```bash
npm run build
# Drag dist/ folder to netlify.com
```

**Option C: Your own server**
```bash
npm run build
# Upload dist/ to your web server
```

---

## 📋 Configuration Checklist

### Orange Pi (.env)
```env
SUPABASE_URL=https://fuiabtdflbodglfexvln.supabase.co
SUPABASE_ANON_KEY=your-anon-key
MACHINE_ID=<uuid-from-vendors-table>
VENDOR_ID=<uuid-of-owner>
PORT=80
```

### Cloud Dashboard (.env.local)
```env
VITE_SUPABASE_URL=https://fuiabtdflbodglfexvln.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

---

## ✅ Verification

### Test Edge Service (Orange Pi)
1. Start server: `npm start`
2. Insert coin (GPIO trigger)
3. Check console for: `[Sync] Sale synced to cloud`
4. Verify in Supabase: `SELECT * FROM sales_logs ORDER BY created_at DESC LIMIT 1`

### Test Cloud Dashboard
1. Open: `https://your-dashboard-url.com`
2. Sign in with vendor email/password
3. Should see machines and sales in real-time
4. Insert coin on Orange Pi
5. Dashboard should update instantly

---

## 🎯 Benefits of Separation

✅ **Orange Pi stays lightweight** - No React bundle, faster startup  
✅ **Dashboard scales independently** - Deploy to CDN, serves unlimited vendors  
✅ **Easier updates** - Update dashboard without touching hardware  
✅ **Better security** - Vendors never access Orange Pi directly  
✅ **Multi-device management** - One vendor manages many Orange Pis  

---

## 📞 Next Steps

1. Clean up current project (remove vendor UI)
2. Create cloud dashboard repository
3. Add edge sync to Orange Pi
4. Deploy dashboard to cloud
5. Configure machine IDs
6. Test end-to-end

Need help with any step? Let me know!
