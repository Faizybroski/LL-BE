import { createClient } from '@supabase/supabase-js'

// Service role key — bypasses RLS. Used ONLY in backend.
// Never expose this key to the frontend.
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      // Use port 6543 (Supavisor transaction mode) in DATABASE_URL
      schema: 'public',
    },
  }
)
