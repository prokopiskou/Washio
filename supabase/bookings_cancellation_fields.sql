-- Run in Supabase SQL Editor
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS cancellation_reason text,
ADD COLUMN IF NOT EXISTS cancellation_details text,
ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
