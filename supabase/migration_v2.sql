-- Add missing columns for production readiness
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_incognito BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS visibility_setting TEXT DEFAULT 'All of Gummifabriken';

-- Update the policy after columns are added
DROP POLICY IF EXISTS "Public profiles are viewable by everyone if not incognito." ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone if not incognito."
  ON public.profiles FOR SELECT
  USING ( is_incognito = false OR auth.uid() = id );

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
