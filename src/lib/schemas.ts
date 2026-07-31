import { z } from "zod";

export const productSchema = z.object({
  name: z.string().min(2, "Le nom doit contenir au moins 2 caractères").max(100),
  slug: z.string().min(2, "Le slug doit contenir au moins 2 caractères").regex(/^[a-z0-9-]+$/, "Le slug ne doit contenir que des lettres minuscules, chiffres et tirets"),
  description: z.string().max(2000).optional(),
  ingredients: z.string().max(2000).optional(),
  how_to_use: z.string().max(2000).optional(),
  price: z.number().positive("Le prix doit être supérieur à 0"),
  original_price: z.number().positive().optional(),
  is_promotion: z.boolean().default(false),
  is_featured: z.boolean().default(false),
  is_active: z.boolean().default(true),
  category_id: z.string().uuid().optional(),
  subcategory_id: z.string().uuid().optional(),
  image_url: z.string().optional(),
  stock_quantity: z.number().int().min(0).default(0),
  weight_grams: z.number().positive().optional(),
  brand: z.string().max(100).optional(),
});

export const productFormSchema = productSchema.refine((data) => {
  if (data.is_promotion && data.original_price) {
    return data.original_price > data.price;
  }
  return true;
}, {
  message: "Le prix original doit être supérieur au prix promotionnel",
  path: ["original_price"],
});

export const categorySchema = z.object({
  name: z.string().min(2, "Le nom doit contenir au moins 2 caractères").max(50),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  image_url: z.string().url().optional().or(z.literal("")),
});

export const subcategorySchema = z.object({
  name: z.string().min(2, "Le nom doit contenir au moins 2 caractères").max(50),
  category_id: z.string().uuid(),
});

export const contactSchema = z.object({
  name: z.string().min(2, "Le nom est requis"),
  email: z.string().email("Email invalide"),
  phone: z.string().optional(),
  subject: z.string().optional(),
  message: z.string().min(10, "Le message doit contenir au moins 10 caractères"),
});

export const siteSettingsSchema = z.object({
  site_name: z.string().min(2).max(100),
  site_description: z.string().max(500).optional(),
  whatsapp_number: z.string().regex(/^\+?\d{10,15}$/, "Numéro WhatsApp invalide"),
  phone_number: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  logo_url: z.string().optional(),
  hero_title: z.string().optional(),
  hero_subtitle: z.string().optional(),
  free_shipping_min: z.number().positive().optional(),
});

export type ProductInput = z.infer<typeof productFormSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type ContactInput = z.infer<typeof contactSchema>;
export type SiteSettingsInput = z.infer<typeof siteSettingsSchema>;
