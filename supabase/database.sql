-- =====================================================
-- KISSARIYA COSMÉTIQUES — Schéma complet
-- Exécuter ce fichier dans l'éditeur SQL Supabase.
-- TOUT le fichier est idempotent (rejouable sans erreur) :
--   * tables : CREATE TABLE IF NOT EXISTS
--   * triggers / policies : DROP IF EXISTS + CREATE
--   * pas de blocs DO $$ (évite les erreurs "unterminated dollar-quoted string")
-- =====================================================

-- =====================================================
-- EXTENSIONS
-- =====================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- Nécessaire pour normaliser les accents lors du backfill des slugs de sous-catégories.
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- =====================================================
-- SCRIPT UNIQUE : CRÉATION DE TOUTES LES TABLES
-- =====================================================
-- Ce bloc est le code unique à exécuter pour créer les tables principales
-- du schéma. Il est idempotent : les tables déjà présentes ne sont pas recréées.
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS public.subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS public.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

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
  promo_enabled BOOLEAN NOT NULL DEFAULT true,
  promo_badge TEXT,
  promo_title TEXT,
  promo_subtitle TEXT,
  promo_link TEXT,
  promo_image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.promos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  badge TEXT,
  title TEXT NOT NULL,
  subtitle TEXT,
  link TEXT NOT NULL DEFAULT '/produits?promotions=true',
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════
-- RBAC : les policies `*_admin_*` vérifient désormais le rôle
-- dans public.profiles via public.is_admin() au lieu de
-- auth.role() = 'authenticated'. Un compte authentifié qui n'a
-- pas le rôle 'admin' ne peut plus lire/écrire les données admin.
-- Cette table est réservée aux accès back-office ; aucun profil visiteur n'est créé.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
SELECT EXISTS (
  SELECT 1 FROM public.profiles
  WHERE user_id = auth.uid() AND role = 'admin'
);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ⚠️ MIGRATION DES DONNÉES EXISTANTES (slug) :
-- Génère les slugs des sous-catégories déjà en base (une seule fois).
UPDATE public.subcategories
SET slug = lower(regexp_replace(
  regexp_replace(unaccent(name), '[^a-zA-Z0-9]+', '-', 'g'),
  '(^-)|(-$)', '', 'g'
))
WHERE slug IS NULL
  AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'unaccent');

UPDATE public.subcategories
SET slug = lower(regexp_replace(
  regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'),
  '(^-)|(-$)', '', 'g'
))
WHERE slug IS NULL;

-- Contrainte d'unicité par catégorie, une fois les données backfillées.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subcategories_category_slug
  ON public.subcategories (category_id, slug);

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

-- Extension pour recherche approximative performante (ilike avec wildcard en début de motif).
-- Sans cet index, un filtre `name.ilike.%terme%` déclenche un scan séquentiel car le B-tree
-- classique ne peut pas exploiter un wildcard en tête. Les index GIN trigram permettent au
-- planificateur de requête de filtrer efficacement même avec `%...%`.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON public.products USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_brand_trgm
  ON public.products USING gin (brand gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_product_images_product_sort
  ON public.product_images (product_id, sort_order);

-- =====================================================
-- STORAGE BUCKET
-- =====================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('cosmetics-images', 'cosmetics-images', true)
ON CONFLICT DO NOTHING;

-- =====================================================
-- SEED DATA
-- =====================================================
-- site_settings est un singleton fonctionnel : ne le créer que si la table est vide.
-- ON CONFLICT seul ne suffit pas ici car la table ne possède pas de clé unique métier.
INSERT INTO public.site_settings (site_name, whatsapp_number, hero_title, hero_subtitle, promo_enabled, promo_badge, promo_title, promo_subtitle, promo_link)
SELECT 'Kissariya Cosmétiques', '+212600000000', 'Votre Beauté, Notre Passion', 'Découvrez notre sélection de cosmétiques naturels et bio au Maroc', true, 'PROMO DU MOMENT', 'Jusqu''à -50%', 'Sur une sélection de cosmétiques naturels & bio', '/produits?promotions=true'
WHERE NOT EXISTS (SELECT 1 FROM public.site_settings);

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

-- Évite de recréer la promotion de démonstration à chaque exécution du schéma.
INSERT INTO public.promos (badge, title, subtitle, link, is_active, sort_order)
SELECT
  'PROMO DU MOMENT',
  'Jusqu''à -50%',
  'Sur une sélection de cosmétiques naturels & bio',
  '/produits?promotions=true',
  true,
  0
WHERE NOT EXISTS (SELECT 1 FROM public.promos);

-- =====================================================
-- FONCTIONS
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- CREATE TABLE IF NOT EXISTS ne modifie pas une table déjà déployée.
-- Cette instruction applique aussi le défaut sûr aux environnements existants.
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'staff';

-- =====================================================
-- UPDATED_AT TRIGGERS (idempotent : DROP + CREATE)
-- =====================================================
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_categories_updated_at ON public.categories;
CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_subcategories_updated_at ON public.subcategories;
CREATE TRIGGER trg_subcategories_updated_at BEFORE UPDATE ON public.subcategories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_site_settings_updated_at ON public.site_settings;
CREATE TRIGGER trg_site_settings_updated_at BEFORE UPDATE ON public.site_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_promos_updated_at ON public.promos;
CREATE TRIGGER trg_promos_updated_at BEFORE UPDATE ON public.promos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

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
ALTER TABLE public.promos ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES (idempotent : DROP + CREATE)
-- =====================================================
-- profiles : table interne de contrôle d'accès du back-office.
-- Aucune policy client : les visiteurs et comptes authentifiés n'y accèdent pas.
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

-- categories
DROP POLICY IF EXISTS "categories_public_select" ON public.categories;
CREATE POLICY "categories_public_select" ON public.categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "categories_admin_manage" ON public.categories;
CREATE POLICY "categories_admin_manage" ON public.categories FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- subcategories
DROP POLICY IF EXISTS "subcategories_public_select" ON public.subcategories;
CREATE POLICY "subcategories_public_select" ON public.subcategories FOR SELECT USING (true);

DROP POLICY IF EXISTS "subcategories_admin_manage" ON public.subcategories;
CREATE POLICY "subcategories_admin_manage" ON public.subcategories FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- products
DROP POLICY IF EXISTS "products_public_select" ON public.products;
CREATE POLICY "products_public_select" ON public.products FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "products_admin_select_all" ON public.products;
CREATE POLICY "products_admin_select_all" ON public.products FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "products_admin_manage" ON public.products;
CREATE POLICY "products_admin_manage" ON public.products FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- product_images
DROP POLICY IF EXISTS "product_images_public_select" ON public.product_images;
CREATE POLICY "product_images_public_select" ON public.product_images FOR SELECT USING (true);

DROP POLICY IF EXISTS "product_images_admin_manage" ON public.product_images;
CREATE POLICY "product_images_admin_manage" ON public.product_images FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- orders
-- ⚠️ INSERT est OUVERT au public : les commandes WhatsApp sont créées par des
--    visiteurs non connectés (services/whatsapp.service.ts → createOrder()).
--    SELECT / UPDATE / DELETE restent réservés aux utilisateurs authentifiés.
-- Migration : l'ancienne policy globale FOR ALL est retirée si elle existe.
DROP POLICY IF EXISTS "orders_admin_manage" ON public.orders;

DROP POLICY IF EXISTS "orders_insert_public" ON public.orders;
CREATE POLICY "orders_insert_public" ON public.orders FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "orders_admin_select" ON public.orders;
CREATE POLICY "orders_admin_select" ON public.orders FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "orders_admin_update" ON public.orders;
CREATE POLICY "orders_admin_update" ON public.orders FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "orders_admin_delete" ON public.orders;
CREATE POLICY "orders_admin_delete" ON public.orders FOR DELETE USING (public.is_admin());

-- contact_messages
DROP POLICY IF EXISTS "contact_messages_insert_public" ON public.contact_messages;
CREATE POLICY "contact_messages_insert_public" ON public.contact_messages FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "contact_messages_admin_select" ON public.contact_messages;
CREATE POLICY "contact_messages_admin_select" ON public.contact_messages FOR SELECT USING (public.is_admin());

-- site_settings
DROP POLICY IF EXISTS "site_settings_public_select" ON public.site_settings;
CREATE POLICY "site_settings_public_select" ON public.site_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "site_settings_admin_manage" ON public.site_settings;
CREATE POLICY "site_settings_admin_manage" ON public.site_settings FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- promos
DROP POLICY IF EXISTS "promos_public_select" ON public.promos;
CREATE POLICY "promos_public_select" ON public.promos FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "promos_admin_select_all" ON public.promos;
CREATE POLICY "promos_admin_select_all" ON public.promos FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "promos_admin_manage" ON public.promos;
CREATE POLICY "promos_admin_manage" ON public.promos FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- storage
DROP POLICY IF EXISTS "images_public_select" ON storage.objects;
CREATE POLICY "images_public_select" ON storage.objects FOR SELECT USING (bucket_id = 'cosmetics-images');

DROP POLICY IF EXISTS "images_authenticated_manage" ON storage.objects;
DROP POLICY IF EXISTS "images_admin_manage" ON storage.objects;
CREATE POLICY "images_admin_manage" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'cosmetics-images' AND public.is_admin())
  WITH CHECK (bucket_id = 'cosmetics-images' AND public.is_admin());

-- =====================================================
-- DEPLOY PUBLIC RLS POLICIES (single SQL block)
-- =====================================================
-- Utiliser ce bloc unique si le projet distant n'a pas encore les policies publiques.
-- Il reste idempotent : DROP IF EXISTS + CREATE.
DROP POLICY IF EXISTS "orders_insert_public" ON public.orders;
CREATE POLICY "orders_insert_public"
  ON public.orders
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "contact_messages_insert_public" ON public.contact_messages;
CREATE POLICY "contact_messages_insert_public"
  ON public.contact_messages
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "contact_messages_admin_select" ON public.contact_messages;
CREATE POLICY "contact_messages_admin_select"
  ON public.contact_messages
  FOR SELECT
  USING (public.is_admin());

-- =====================================================
-- REFRESH SCHEMA CACHE
-- =====================================================
NOTIFY pgrst, 'reload schema';
