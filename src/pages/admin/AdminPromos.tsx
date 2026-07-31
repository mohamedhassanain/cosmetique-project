import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/auth-utils';
import { useAllPromos, useCreatePromo, useUpdatePromo, useDeletePromo } from '@/hooks/usePromos';
import { useImageUpload } from '@/hooks/useImageUpload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Upload, Loader2, X, Plus, Pencil, Trash2, Megaphone } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PromoFormState {
  id: string | null;
  badge: string;
  title: string;
  subtitle: string;
  link: string;
  is_active: boolean;
  sort_order: number;
  image_url: string;
}

const EMPTY_FORM: PromoFormState = {
  id: null,
  badge: '',
  title: '',
  subtitle: '',
  link: '/produits?promotions=true',
  is_active: true,
  sort_order: 0,
  image_url: '',
};

export default function AdminPromos() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { data: promos = [], isLoading } = useAllPromos();
  const createPromo = useCreatePromo();
  const updatePromo = useUpdatePromo();
  const deletePromo = useDeletePromo();
  const { uploadImage, uploading } = useImageUpload();

  const [form, setForm] = useState<PromoFormState>(EMPTY_FORM);
  const [isEditing, setIsEditing] = useState(false);
  const [imagePreview, setImagePreview] = useState('');

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [user, authLoading, navigate]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setImagePreview('');
    setIsEditing(false);
  };

  const startEdit = (p: NonNullable<typeof promos>[number]) => {
    setForm({
      id: p.id,
      badge: p.badge || '',
      title: p.title,
      subtitle: p.subtitle || '',
      link: p.link,
      is_active: p.is_active,
      sort_order: p.sort_order,
      image_url: p.image_url || '',
    });
    setImagePreview(p.image_url || '');
    setIsEditing(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadImage(file, 'promos');
    if (url) {
      setForm(f => ({ ...f, image_url: url }));
      setImagePreview(url);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;

    const payload = {
      badge: form.badge,
      title: form.title,
      subtitle: form.subtitle,
      link: form.link,
      is_active: form.is_active,
      sort_order: Number(form.sort_order) || 0,
      image_url: form.image_url,
    };

    if (isEditing && form.id) {
      await updatePromo.mutateAsync({ id: form.id, ...payload });
    } else {
      await createPromo.mutateAsync(payload);
    }
    resetForm();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette publicité ?')) return;
    await deletePromo.mutateAsync(id);
  };

  const toggleActive = (p: NonNullable<typeof promos>[number]) => {
    updatePromo.mutate({ id: p.id, is_active: !p.is_active });
  };

  if (authLoading || isLoading) {
    return <div className="min-h-screen bg-pink-50 p-6"><Skeleton className="h-96 rounded-2xl" /></div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-rose-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" asChild><Link to="/admin"><ArrowLeft className="h-5 w-5" /></Link></Button>
          <h1 className="text-2xl font-display font-bold text-pink-900 flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-pink-500" />
            Publicités
          </h1>
        </div>

        <div className="space-y-6">
          {/* Formulaire ajout/édition */}
          <Card className="border-pink-100">
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <h2 className="font-bold text-pink-900">
                  {isEditing ? 'Modifier la publicité' : 'Nouvelle publicité'}
                </h2>

                <div className="space-y-2">
                  <Label>Image (optionnelle)</Label>
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-2xl bg-pink-50 overflow-hidden border border-pink-100 flex items-center justify-center">
                      {imagePreview ? <img src={imagePreview} alt="" className="w-full h-full object-cover" /> : <Upload className="h-8 w-8 text-pink-300" />}
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" className="border-pink-200 text-pink-600" onClick={() => document.getElementById('promo-image-input')?.click()}>
                        <Upload className="h-4 w-4 mr-2" />Modifier
                      </Button>
                      {imagePreview && (
                        <Button type="button" variant="outline" className="border-red-200 text-red-500 hover:bg-red-50" onClick={() => { setForm(f => ({ ...f, image_url: '' })); setImagePreview(''); }}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <input id="promo-image-input" type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </div>
                </div>

                <div className="space-y-2"><Label>Badge</Label><Input value={form.badge} onChange={e => setForm(f => ({ ...f, badge: e.target.value }))} placeholder="PROMO DU MOMENT" className="border-pink-200" /></div>
                <div className="space-y-2"><Label>Titre *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Jusqu'à -50%" className="border-pink-200" required /></div>
                <div className="space-y-2"><Label>Sous-titre</Label><Input value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))} placeholder="Sur une sélection de cosmétiques naturels & bio" className="border-pink-200" /></div>
                <div className="space-y-2"><Label>Lien</Label><Input value={form.link} onChange={e => setForm(f => ({ ...f, link: e.target.value }))} placeholder="/produits?promotions=true" className="border-pink-200" /></div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Ordre d'affichage</Label>
                    <Input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))} className="border-pink-200" />
                  </div>
                  <div className="space-y-2 flex items-end">
                    <label className="flex items-center gap-2 pb-2 cursor-pointer">
                      <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} aria-label="Activer la publicité" />
                      <span className="text-sm text-pink-700">Active</span>
                    </label>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button type="submit" className="flex-1 bg-pink-400 hover:bg-pink-500 text-white rounded-full" disabled={uploading || createPromo.isPending || updatePromo.isPending}>
                    {(uploading || createPromo.isPending || updatePromo.isPending) ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enregistrement...</> : (isEditing ? 'Enregistrer les modifications' : 'Ajouter la publicité')}
                  </Button>
                  {isEditing && (
                    <Button type="button" variant="outline" className="border-pink-200 text-pink-700" onClick={resetForm}>
                      Annuler
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Liste des pubs */}
          <div className="space-y-3">
            {promos.length === 0 && (
              <p className="text-center text-pink-400 py-8">Aucune publicité. Ajoutez-en une ci-dessus.</p>
            )}
            {promos.map((p, i) => (
              <Card key={p.id} className={cn("border-pink-100", !p.is_active && "opacity-60")}>
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="h-14 w-14 rounded-xl bg-pink-50 overflow-hidden border border-pink-100 shrink-0">
                    {p.image_url ? <img src={p.image_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Megaphone className="h-6 w-6 text-pink-300" /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-pink-900 truncate">{p.title}</p>
                    <p className="text-xs text-pink-500 truncate">{p.badge || '—'} · ordre {p.sort_order}</p>
                  </div>
                  <Switch
                    checked={p.is_active}
                    onCheckedChange={() => toggleActive(p)}
                    aria-label={`Activer la publicité ${i + 1}`}
                  />
                  <Button variant="ghost" size="sm" className="text-pink-500" onClick={() => startEdit(p)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-500" onClick={() => handleDelete(p.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
