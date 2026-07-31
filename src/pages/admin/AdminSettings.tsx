import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/auth-utils';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { useImageUpload } from '@/hooks/useImageUpload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Upload, Loader2, X } from 'lucide-react';

export default function AdminSettings() {
  const { user, loading: authLoading } = useAuth();
  const { settings, isLoading, updateSettings } = useSiteSettings();
  const { uploadImage, uploading } = useImageUpload();
  const navigate = useNavigate();

  const [siteName, setSiteName] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [heroTitle, setHeroTitle] = useState('');
  const [heroSubtitle, setHeroSubtitle] = useState('');
  const [logoPreview, setLogoPreview] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  // Carte pub (hero)
  const [promoEnabled, setPromoEnabled] = useState(true);
  const [promoBadge, setPromoBadge] = useState('');
  const [promoTitle, setPromoTitle] = useState('');
  const [promoSubtitle, setPromoSubtitle] = useState('');
  const [promoLink, setPromoLink] = useState('/produits?promotions=true');
  const [promoImagePreview, setPromoImagePreview] = useState('');
  const [promoImageUrl, setPromoImageUrl] = useState('');

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (settings) {
      setSiteName(settings.site_name || '');
      setWhatsappNumber(settings.whatsapp_number || '');
      setPhoneNumber(settings.phone_number || '');
      setHeroTitle(settings.hero_title || '');
      setHeroSubtitle(settings.hero_subtitle || '');
      setLogoUrl(settings.logo_url || '');
      setLogoPreview(settings.logo_url || '');

      setPromoEnabled(settings.promo_enabled !== false);
      setPromoBadge(settings.promo_badge || '');
      setPromoTitle(settings.promo_title || '');
      setPromoSubtitle(settings.promo_subtitle || '');
      setPromoLink(settings.promo_link || '');
      setPromoImageUrl(settings.promo_image_url || '');
      setPromoImagePreview(settings.promo_image_url || '');
    }
  }, [settings]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadImage(file, 'site');
    if (url) { setLogoUrl(url); setLogoPreview(url); }
  };

  const handlePromoImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadImage(file, 'site');
    if (url) { setPromoImageUrl(url); setPromoImagePreview(url); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings.mutateAsync({
      site_name: siteName,
      whatsapp_number: whatsappNumber,
      phone_number: phoneNumber,
      logo_url: logoUrl,
      hero_title: heroTitle,
      hero_subtitle: heroSubtitle,
      promo_enabled: promoEnabled,
      promo_badge: promoBadge,
      promo_title: promoTitle,
      promo_subtitle: promoSubtitle,
      promo_link: promoLink,
      promo_image_url: promoImageUrl,
    });
  };

  if (authLoading || isLoading) {
    return <div className="min-h-screen bg-pink-50 p-6"><Skeleton className="h-96 rounded-2xl" /></div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-rose-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" asChild><Link to="/admin"><ArrowLeft className="h-5 w-5" /></Link></Button>
          <h1 className="text-2xl font-display font-bold text-pink-900">Paramètres</h1>
        </div>

        <div className="space-y-6">
          <Card className="border-pink-100">
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Logo */}
                <div className="space-y-2">
                  <Label>Logo du site</Label>
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-2xl bg-pink-50 overflow-hidden border border-pink-100 flex items-center justify-center">
                      {logoPreview ? <img src={logoPreview} alt="" className="w-full h-full object-cover" /> : <Upload className="h-8 w-8 text-pink-300" />}
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" className="border-pink-200 text-pink-600" onClick={() => document.getElementById('logo-input')?.click()}>
                        <Upload className="h-4 w-4 mr-2" />Modifier
                      </Button>
                      {logoPreview && (
                        <Button type="button" variant="outline" className="border-red-200 text-red-500 hover:bg-red-50" onClick={() => { setLogoUrl(''); setLogoPreview(''); }}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <input id="logo-input" type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                  </div>
                </div>

                <div className="space-y-2"><Label>Nom du site</Label><Input value={siteName} onChange={e => setSiteName(e.target.value)} className="border-pink-200" /></div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>WhatsApp *</Label><Input value={whatsappNumber} onChange={e => setWhatsappNumber(e.target.value)} placeholder="+2126XXXXXXX" className="border-pink-200" /></div>
                  <div className="space-y-2"><Label>Téléphone</Label><Input value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} className="border-pink-200" /></div>
                </div>

                <div className="space-y-2"><Label>Titre du hero</Label><Input value={heroTitle} onChange={e => setHeroTitle(e.target.value)} placeholder="Votre Beauté, Notre Passion" className="border-pink-200" /></div>
                <div className="space-y-2"><Label>Sous-titre du hero</Label><Input value={heroSubtitle} onChange={e => setHeroSubtitle(e.target.value)} className="border-pink-200" /></div>

                <Button type="submit" className="w-full bg-pink-400 hover:bg-pink-500 text-white rounded-full" disabled={updateSettings.isPending}>
                  {updateSettings.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enregistrement...</> : 'Enregistrer les modifications'}
                </Button>

                <hr className="border-pink-100" />

                {/* Carte pub (hero) */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Activer la carte pub</Label>
                    <Switch
                      checked={promoEnabled}
                      onCheckedChange={setPromoEnabled}
                      aria-label="Activer la carte pub"
                    />
                  </div>

                  <div className="space-y-2"><Label>Badge</Label><Input value={promoBadge} onChange={e => setPromoBadge(e.target.value)} placeholder="PROMO DU MOMENT" className="border-pink-200" /></div>
                  <div className="space-y-2"><Label>Titre de l'offre</Label><Input value={promoTitle} onChange={e => setPromoTitle(e.target.value)} placeholder="Jusqu'à -50%" className="border-pink-200" /></div>
                  <div className="space-y-2"><Label>Sous-titre</Label><Input value={promoSubtitle} onChange={e => setPromoSubtitle(e.target.value)} placeholder="Sur une sélection de cosmétiques naturels & bio" className="border-pink-200" /></div>
                  <div className="space-y-2"><Label>Lien du bouton</Label><Input value={promoLink} onChange={e => setPromoLink(e.target.value)} placeholder="/produits?promotions=true" className="border-pink-200" /></div>

                  <div className="space-y-2">
                    <Label>Image de la carte (optionnel)</Label>
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 rounded-2xl bg-pink-50 overflow-hidden border border-pink-100 flex items-center justify-center">
                        {promoImagePreview ? <img src={promoImagePreview} alt="" className="w-full h-full object-cover" /> : <Upload className="h-8 w-8 text-pink-300" />}
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" className="border-pink-200 text-pink-600" onClick={() => document.getElementById('promo-image-input')?.click()}>
                          <Upload className="h-4 w-4 mr-2" />Modifier
                        </Button>
                        {promoImagePreview && (
                          <Button type="button" variant="outline" className="border-red-200 text-red-500 hover:bg-red-50" onClick={() => { setPromoImageUrl(''); setPromoImagePreview(''); }}>
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <input id="promo-image-input" type="file" accept="image/*" className="hidden" onChange={handlePromoImageUpload} />
                    </div>
                  </div>

                  <Button type="submit" className="w-full bg-pink-400 hover:bg-pink-500 text-white rounded-full" disabled={updateSettings.isPending}>
                    {uploading || updateSettings.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enregistrement...</> : 'Enregistrer la carte pub'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
