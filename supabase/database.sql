-- =====================================================
-- KISSARIYA COSMÉTIQUES — Schéma complet
-- Exécuter ce fichier UNE FOIS dans l'éditeur SQL Supabase
-- =====================================================

-- =====================================================
-- EXTENSION
-- =====================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- PROFILES (admin uniquement)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- CATEGORIES
-- =====================================================
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  image_url TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- SUBCATEGORIES
-- =====================================================
CREATE TABLE IF NOT EXISTS public.subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- PRODUCTS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  ingredients TEXT,
  how_to_use TEXT,
  price NUMERIC NOT NULL,
  original_price NUMERIC,
  is_promotion BOOLEAN DEFAULT false,
  is_featured BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  image_url TEXT,
  video_url TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  subcategory_id UUID REFERENCES public.subcategories(id) ON DELETE SET NULL,
  stock_quantity INTEGER DEFAULT 0,
  weight_grams NUMERIC,
  brand TEXT,
  location_city TEXT,
  location_url TEXT,
  show_location BOOLEAN DEFAULT FALSE,
  search_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector('french',
        coalesce(name, '') || ' ' ||
        coalesce(brand, '') || ' ' ||
        coalesce(description, '')
      )
    ) STORED,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index plein-texte pour la recherche côté serveur
CREATE INDEX IF NOT EXISTS idx_products_search_vector
  ON public.products USING GIN (search_vector);

-- Index pour pagination (tri par date)
CREATE INDEX IF NOT EXISTS idx_products_created_at
  ON public.products (created_at DESC);

-- Index pour les filtres courants
CREATE INDEX IF NOT EXISTS idx_products_category
  ON public.products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_subcategory
  ON public.products (subcategory_id);
CREATE INDEX IF NOT EXISTS idx_products_active
  ON public.products (is_active);
CREATE INDEX IF NOT EXISTS idx_products_promotion
  ON public.products (is_promotion) WHERE is_promotion = true;
CREATE INDEX IF NOT EXISTS idx_products_featured
  ON public.products (is_featured) WHERE is_featured = true;

-- =====================================================
-- PRODUCT IMAGES (table normalisée au lieu de JSON)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product_sort
  ON public.product_images (product_id, sort_order);

-- =====================================================
-- ORDERS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_city TEXT,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  total_price NUMERIC NOT NULL,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- CONTACT MESSAGES
-- =====================================================
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- SITE SETTINGS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.site_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_name TEXT NOT NULL DEFAULT 'Kissariya Cosmétiques',
  site_description TEXT,
  whatsapp_number TEXT,
  phone_number TEXT,
  email TEXT,
  address TEXT,
  logo_url TEXT,
  favicon_url TEXT,
  hero_title TEXT,
  hero_subtitle TEXT,
  free_shipping_min NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- STORAGE BUCKET
-- =====================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('cosmetics-images', 'cosmetics-images', true)
ON CONFLICT DO NOTHING;

-- =====================================================
-- SEED DATA
-- =====================================================
INSERT INTO public.site_settings (site_name, whatsapp_number, hero_title, hero_subtitle)
VALUES ('Kissariya Cosmétiques', '+212600000000', 'Votre Beauté, Notre Passion', 'Découvrez notre sélection de cosmétiques naturels et bio au Maroc')
ON CONFLICT DO NOTHING;

INSERT INTO public.categories (name, slug, description, sort_order) VALUES
('Soins Visage', 'soins-visage', 'Crèmes, sérums, nettoyants et masques pour le visage', 1),
('Soins Corps', 'soins-corps', 'Hydratants, exfoliants et huiles pour le corps', 2),
('Soins Cheveux', 'soins-cheveux', 'Shampoings, après-shampoings et masques capillaires', 3),
('Maquillage', 'maquillage', 'Fond de teint, rouges à lèvres, fards et plus', 4),
('Parfums', 'parfums', 'Eaux de parfum, eaux de toilette et attars', 5),
('Naturel & Bio', 'naturel-bio', 'Produits naturels, bio et artisanaux', 6),
('Hygiène', 'hygiene', 'Savons, dentifrices et déodorants', 7),
('Accessoires', 'accessoires-beaute', 'Pinceaux, éponges et outils de beauté', 8)
ON CONFLICT DO NOTHING;

-- =====================================================
-- UPDATED_AT TRIGGER
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_profiles_updated_at') THEN
    CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_categories_updated_at') THEN
    CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_subcategories_updated_at') THEN
    CREATE TRIGGER trg_subcategories_updated_at BEFORE UPDATE ON public.subcategories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_products_updated_at') THEN
    CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_site_settings_updated_at') THEN
    CREATE TRIGGER trg_site_settings_updated_at BEFORE UPDATE ON public.site_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- =====================================================
-- AUTO CREATE PROFILE ON SIGNUP
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
    CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES
-- =====================================================
DO $$
BEGIN
  -- profiles
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profiles_select_own' AND tablename = 'profiles') THEN
    CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profiles_insert_own' AND tablename = 'profiles') THEN
    CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profiles_update_own' AND tablename = 'profiles') THEN
    CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  -- categories
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'categories_public_select' AND tablename = 'categories') THEN
    CREATE POLICY "categories_public_select" ON public.categories FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'categories_admin_manage' AND tablename = 'categories') THEN
    CREATE POLICY "categories_admin_manage" ON public.categories FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
  END IF;

  -- subcategories
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'subcategories_public_select' AND tablename = 'subcategories') THEN
    CREATE POLICY "subcategories_public_select" ON public.subcategories FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'subcategories_admin_manage' AND tablename = 'subcategories') THEN
    CREATE POLICY "subcategories_admin_manage" ON public.subcategories FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
  END IF;

  -- products
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'products_public_select' AND tablename = 'products') THEN
    CREATE POLICY "products_public_select" ON public.products FOR SELECT USING (is_active = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'products_admin_select_all' AND tablename = 'products') THEN
    CREATE POLICY "products_admin_select_all" ON public.products FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'products_admin_manage' AND tablename = 'products') THEN
    CREATE POLICY "products_admin_manage" ON public.products FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
  END IF;

  -- product_images
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'product_images_public_select' AND tablename = 'product_images') THEN
    CREATE POLICY "product_images_public_select" ON public.product_images FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'product_images_admin_manage' AND tablename = 'product_images') THEN
    CREATE POLICY "product_images_admin_manage" ON public.product_images FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
  END IF;

  -- orders
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'orders_admin_manage' AND tablename = 'orders') THEN
    CREATE POLICY "orders_admin_manage" ON public.orders FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
  END IF;

  -- contact_messages
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'contact_messages_insert_public' AND tablename = 'contact_messages') THEN
    CREATE POLICY "contact_messages_insert_public" ON public.contact_messages FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'contact_messages_admin_select' AND tablename = 'contact_messages') THEN
    CREATE POLICY "contact_messages_admin_select" ON public.contact_messages FOR SELECT USING (auth.role() = 'authenticated');
  END IF;

  -- site_settings
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'site_settings_public_select' AND tablename = 'site_settings') THEN
    CREATE POLICY "site_settings_public_select" ON public.site_settings FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'site_settings_admin_manage' AND tablename = 'site_settings') THEN
    CREATE POLICY "site_settings_admin_manage" ON public.site_settings FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
  END IF;

  -- storage
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'images_public_select' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "images_public_select" ON storage.objects FOR SELECT USING (bucket_id = 'cosmetics-images');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'images_authenticated_manage' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "images_authenticated_manage" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'cosmetics-images') WITH CHECK (bucket_id = 'cosmetics-images');
  END IF;
END $$;

-- =====================================================
-- REFRESH SCHEMA CACHE
-- =====================================================
NOTIFY pgrst, 'reload schema';
