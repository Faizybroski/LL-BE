/**
 * Seed script — Logical Links CMS
 *
 * Creates dev/staging test data via the Supabase Admin API so that auth users
 * appear in the Authentication dashboard and can sign in normally.
 *
 * Usage (from backend/):
 *   npm run seed
 *
 * Credentials after seeding:
 *   admin@logicallinks.com.au   Admin@1234
 *   alice@fastfreight.com.au    Shipper@1234
 *   bob@aussielogistics.com.au  Shipper@1234
 *   carol@sydneyexpress.com.au  Shipper@1234
 *   dave@pendingfreight.com.au  Shipper@1234  (pending approval)
 *
 * Safe to re-run — all upserts on conflict.
 *
 * Status machine: pending → confirmed → assigned → in_transit → delivered/cancelled
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

import { createClient } from '@supabase/supabase-js'

// ── Validate env ──────────────────────────────────────────────────────────────

const SUPABASE_URL              = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env')
  process.exit(1)
}

// ── Client ────────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Fixed UUIDs ───────────────────────────────────────────────────────────────

const ID = {
  // Accounts
  acct1: 'aaaaaaaa-0000-0000-0000-000000000001', // Fast Freight Pty Ltd
  acct2: 'aaaaaaaa-0000-0000-0000-000000000002', // Sydney Express Logistics
  acct3: 'aaaaaaaa-0000-0000-0000-000000000003', // Pending Freight Co (unapproved)
  // Shipments
  ship1: '11111111-0000-0000-0000-000000000001',
  ship2: '11111111-0000-0000-0000-000000000002',
  ship3: '11111111-0000-0000-0000-000000000003',
  ship4: '11111111-0000-0000-0000-000000000004',
  ship5: '11111111-0000-0000-0000-000000000005',
  ship6: '11111111-0000-0000-0000-000000000006',
}

// ── Logging helpers ───────────────────────────────────────────────────────────

const step = (msg: string) => console.log(`\n${msg}`)
const ok   = (msg: string) => console.log(`  ✓  ${msg}`)
const skip = (msg: string) => console.log(`  ↩  ${msg} — already exists`)

function assertOk(label: string, error: { message: string } | null) {
  if (error) throw new Error(`[${label}] ${error.message}`)
}

// ── Dynamic user ID map (populated during seedAuthUsers) ─────────────────────

const USER_IDS: Record<string, string> = {}

// ── 1. Auth users ─────────────────────────────────────────────────────────────

const AUTH_USERS = [
  { email: 'admin@logicallinks.com.au',  password: 'Admin@1234',   fullName: 'System Admin'  },
  { email: 'alice@fastfreight.com.au',   password: 'Shipper@1234', fullName: 'Alice Nguyen'  },
  { email: 'bob@aussielogistics.com.au', password: 'Shipper@1234', fullName: 'Bob Chen'      },
  { email: 'carol@sydneyexpress.com.au', password: 'Shipper@1234', fullName: 'Carol Smith'   },
  { email: 'dave@pendingfreight.com.au', password: 'Shipper@1234', fullName: 'Dave Kowalski' },
]

async function seedAuthUsers() {
  step('👤  Auth users')

  for (const u of AUTH_USERS) {
    const { data, error } = await supabase.auth.admin.createUser({
      email:         u.email,
      password:      u.password,
      email_confirm: true,
      user_metadata: { full_name: u.fullName },
    })

    if (error) {
      if (/already (been )?registered|already exists|duplicate/i.test(error.message)) {
        // Try to fetch the existing user's ID
        const { data: list } = await supabase.auth.admin.listUsers()
        const existing = list?.users.find((x) => x.email === u.email)
        if (existing) USER_IDS[u.email] = existing.id
        skip(u.email)
      } else {
        throw new Error(`[auth] ${u.email}: ${error.message}`)
      }
    } else if (data.user) {
      USER_IDS[u.email] = data.user.id
      ok(u.email)
    }
  }
}

// ── 2. Accounts ───────────────────────────────────────────────────────────────

async function seedAccounts() {
  step('🏢  Accounts')

  const adminId = USER_IDS['admin@logicallinks.com.au']

  const { error } = await supabase.from('accounts').upsert(
    [
      {
        account_id:      ID.acct1,
        account_name:    'Fast Freight Pty Ltd',
        contact_name:    'Alice Nguyen',
        contact_email:   'alice@fastfreight.com.au',
        contact_phone:   '0412 000 001',
        billing_address: '100 Freight Road',
        billing_city:    'Sydney',
        billing_state:   'NSW',
        billing_postcode:'2000',
        is_active:       true,
        created_by:      adminId,
      },
      {
        account_id:      ID.acct2,
        account_name:    'Sydney Express Logistics',
        contact_name:    'Carol Smith',
        contact_email:   'carol@sydneyexpress.com.au',
        contact_phone:   '0412 000 003',
        billing_address: '50 Express Way',
        billing_city:    'Melbourne',
        billing_state:   'VIC',
        billing_postcode:'3000',
        is_active:       true,
        created_by:      adminId,
      },
      {
        account_id:      ID.acct3,
        account_name:    'Pending Freight Co',
        contact_name:    'Dave Kowalski',
        contact_email:   'dave@pendingfreight.com.au',
        contact_phone:   '0412 000 004',
        billing_address: '77 Startup Lane',
        billing_city:    'Perth',
        billing_state:   'WA',
        billing_postcode:'6000',
        is_active:       true,
        created_by:      adminId,
      },
    ],
    { onConflict: 'account_id' },
  )

  assertOk('accounts', error)
  ok('Fast Freight Pty Ltd + Sydney Express Logistics + Pending Freight Co')
}

// ── 3. Profiles ───────────────────────────────────────────────────────────────

async function seedProfiles() {
  step('📋  Profiles')

  const adminId = USER_IDS['admin@logicallinks.com.au']
  const aliceId = USER_IDS['alice@fastfreight.com.au']
  const bobId   = USER_IDS['bob@aussielogistics.com.au']
  const carolId = USER_IDS['carol@sydneyexpress.com.au']
  const daveId  = USER_IDS['dave@pendingfreight.com.au']

  const { error } = await supabase.from('profiles').upsert(
    [
      {
        id:          adminId,
        role:        'admin',
        full_name:   'System Admin',
        is_active:   true,
        is_approved: true,
        account_id:  null,
      },
      {
        id:          aliceId,
        role:        'shipper',
        full_name:   'Alice Nguyen',
        is_active:   true,
        is_approved: true,
        account_id:  ID.acct1,
      },
      {
        id:          bobId,
        role:        'shipper',
        full_name:   'Bob Chen',
        is_active:   true,
        is_approved: true,
        account_id:  ID.acct2,
      },
      {
        id:          carolId,
        role:        'shipper',
        full_name:   'Carol Smith',
        is_active:   true,
        is_approved: true,
        account_id:  ID.acct2,
      },
      {
        id:          daveId,
        role:        'shipper',
        full_name:   'Dave Kowalski',
        is_active:   true,
        is_approved: false,
        account_id:  ID.acct3,
      },
    ],
    { onConflict: 'id' },
  )

  assertOk('profiles', error)
  ok('admin + 3 approved shippers + 1 pending shipper (Dave)')
}

// ── 4. Shipments ──────────────────────────────────────────────────────────────
// Covers all 5 non-cancelled statuses: pending, confirmed, assigned, in_transit, delivered

async function seedShipments() {
  step('📦  Shipments')

  const aliceId = USER_IDS['alice@fastfreight.com.au']
  const bobId   = USER_IDS['bob@aussielogistics.com.au']
  const carolId = USER_IDS['carol@sydneyexpress.com.au']

  const now  = Date.now()
  const ago  = (days: number) => new Date(now - days * 86_400_000).toISOString()
  const from = (days: number) => new Date(now + days * 86_400_000).toISOString()

  const { error } = await supabase.from('shipments').upsert(
    [
      {
        shipment_id:          ID.ship1,
        account_id:           ID.acct1,
        created_by:           aliceId,
        shipment_type:        'freight',
        status:               'in_transit',
        origin_address:       '100 Freight Road',
        origin_city:          'Sydney',
        origin_state:         'NSW',
        origin_postcode:      '2000',
        destination_address:  '88 Industrial Ave',
        destination_city:     'Melbourne',
        destination_state:    'VIC',
        destination_postcode: '3000',
        cargo_description:    'Industrial machinery — 3 pallets',
        weight_kg:            1200,
        pieces:               3,
        estimated_pickup_date:   ago(2),
        estimated_delivery_date: from(1),
        reference_number:     'FFP-2024-001',
      },
      {
        shipment_id:          ID.ship2,
        account_id:           ID.acct1,
        created_by:           aliceId,
        shipment_type:        'last_mile',
        status:               'pending',
        origin_address:       '22 Warehouse Drive',
        origin_city:          'Parramatta',
        origin_state:         'NSW',
        origin_postcode:      '2150',
        destination_address:  '5 Residential Street',
        destination_city:     'Penrith',
        destination_state:    'NSW',
        destination_postcode: '2750',
        cargo_description:    'Consumer electronics — 12 boxes',
        weight_kg:            85,
        pieces:               12,
        estimated_pickup_date:   from(1),
        estimated_delivery_date: from(2),
        reference_number:     'FFP-2024-002',
      },
      {
        shipment_id:          ID.ship3,
        account_id:           ID.acct2,
        created_by:           carolId,
        shipment_type:        'freight',
        status:               'assigned',
        origin_address:       '10 Port Road',
        origin_city:          'Brisbane',
        origin_state:         'QLD',
        origin_postcode:      '4000',
        destination_address:  '99 Factory Lane',
        destination_city:     'Gold Coast',
        destination_state:    'QLD',
        destination_postcode: '4217',
        cargo_description:    'Food-grade packaging materials',
        weight_kg:            450,
        pieces:               5,
        estimated_pickup_date:   from(3),
        estimated_delivery_date: from(5),
        reference_number:     'SEL-2024-011',
      },
      {
        shipment_id:          ID.ship4,
        account_id:           ID.acct2,
        created_by:           bobId,
        shipment_type:        'freight',
        status:               'delivered',
        origin_address:       '45 Harbour Blvd',
        origin_city:          'Sydney',
        origin_state:         'NSW',
        origin_postcode:      '2000',
        destination_address:  '7 Commerce Park',
        destination_city:     'Canberra',
        destination_state:    'ACT',
        destination_postcode: '2601',
        cargo_description:    'Office furniture — disassembled',
        weight_kg:            280,
        pieces:               8,
        estimated_pickup_date:   ago(5),
        estimated_delivery_date: ago(2),
        actual_delivery_date:    ago(2),
        reference_number:     'SEL-2024-007',
      },
      {
        shipment_id:          ID.ship5,
        account_id:           ID.acct1,
        created_by:           aliceId,
        shipment_type:        'freight',
        status:               'confirmed',
        origin_address:       '55 Industrial Park',
        origin_city:          'Newcastle',
        origin_state:         'NSW',
        origin_postcode:      '2300',
        destination_address:  '120 West Road',
        destination_city:     'Sydney',
        destination_state:    'NSW',
        destination_postcode: '2000',
        cargo_description:    'Steel coils — 2 rolls',
        weight_kg:            3500,
        pieces:               2,
        quoted_price:         1850,
        currency:             'AUD',
        estimated_pickup_date:   from(2),
        estimated_delivery_date: from(3),
        reference_number:     'FFP-2024-003',
      },
      {
        shipment_id:          ID.ship6,
        account_id:           ID.acct2,
        created_by:           carolId,
        shipment_type:        'last_mile',
        status:               'pending',
        origin_address:       '300 Distribution Centre',
        origin_city:          'Rocklea',
        origin_state:         'QLD',
        origin_postcode:      '4106',
        destination_address:  '12 Main Street',
        destination_city:     'Ipswich',
        destination_state:    'QLD',
        destination_postcode: '4305',
        cargo_description:    'Retail goods — 20 cartons',
        weight_kg:            120,
        pieces:               20,
        estimated_pickup_date:   from(1),
        estimated_delivery_date: from(2),
        reference_number:     'SEL-2024-012',
      },
    ],
    { onConflict: 'shipment_id' },
  )

  assertOk('shipments', error)
  ok('6 shipments (pending ×2, confirmed, assigned, in_transit, delivered)')
}

// ── 5. Notifications ──────────────────────────────────────────────────────────

async function seedNotifications() {
  step('🔔  Notifications')

  const adminId = USER_IDS['admin@logicallinks.com.au']
  const aliceId = USER_IDS['alice@fastfreight.com.au']
  const carolId = USER_IDS['carol@sydneyexpress.com.au']

  const now = Date.now()
  const ago = (hours: number) => new Date(now - hours * 3_600_000).toISOString()

  const { error } = await supabase.from('notifications').upsert(
    [
      // Admin notifications
      {
        notification_id: 'bbbbbbbb-0000-0000-0000-000000000001',
        user_id:         adminId,
        type:            'system',
        title:           'New shipper registration',
        body:            'Dave Kowalski from Pending Freight Co has registered and is awaiting approval.',
        entity_type:     'user',
        is_read:         false,
        created_at:      ago(1),
      },
      {
        notification_id: 'bbbbbbbb-0000-0000-0000-000000000002',
        user_id:         adminId,
        type:            'shipment_status',
        title:           'Shipment delivered',
        body:            'Load SEL-2024-007 has been delivered to Canberra ACT.',
        entity_type:     'shipment',
        entity_id:       ID.ship4,
        is_read:         true,
        read_at:         ago(2),
        created_at:      ago(3),
      },
      {
        notification_id: 'bbbbbbbb-0000-0000-0000-000000000003',
        user_id:         adminId,
        type:            'shipment_status',
        title:           'Shipment in transit',
        body:            'Load FFP-2024-001 is now in transit to Melbourne VIC.',
        entity_type:     'shipment',
        entity_id:       ID.ship1,
        is_read:         false,
        created_at:      ago(5),
      },
      // Alice (shipper) notifications
      {
        notification_id: 'bbbbbbbb-0000-0000-0000-000000000004',
        user_id:         aliceId,
        type:            'shipment_status',
        title:           'Your shipment is in transit',
        body:            'Load FFP-2024-001 has been picked up and is on the way to Melbourne.',
        entity_type:     'shipment',
        entity_id:       ID.ship1,
        is_read:         false,
        created_at:      ago(5),
      },
      {
        notification_id: 'bbbbbbbb-0000-0000-0000-000000000005',
        user_id:         aliceId,
        type:            'shipment_status',
        title:           'Shipment confirmed',
        body:            'Load FFP-2024-003 has been confirmed and is scheduled for pickup.',
        entity_type:     'shipment',
        entity_id:       ID.ship5,
        is_read:         true,
        read_at:         ago(6),
        created_at:      ago(8),
      },
      // Carol (shipper) notifications
      {
        notification_id: 'bbbbbbbb-0000-0000-0000-000000000006',
        user_id:         carolId,
        type:            'system',
        title:           'Account approved',
        body:            'Your shipper account has been approved. You can now create and manage shipments.',
        is_read:         true,
        read_at:         ago(48),
        created_at:      ago(50),
      },
    ],
    { onConflict: 'notification_id' },
  )

  assertOk('notifications', error)
  ok('3 admin + 2 Alice + 1 Carol notifications')
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱  Seeding Logical Links database...')
  console.log(`📡  ${SUPABASE_URL}`)

  await seedAuthUsers()
  await seedAccounts()
  await seedProfiles()
  await seedShipments()
  await seedNotifications()

  console.log('\n✅  Seed complete!\n')
  console.log('Credentials:')
  for (const u of AUTH_USERS) {
    console.log(`  ${u.email.padEnd(42)}  ${u.password}`)
  }
  console.log()
}

main().catch((err: Error) => {
  console.error('\n❌  Seed failed:', err.message)
  process.exit(1)
})
