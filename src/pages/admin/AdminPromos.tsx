import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/providers/auth-utils';
import { useAllPromos, useCreatePromo, useUpdatePromo, useDeletePromo } from '@/hooks/usePromos';
import { useImageUpload } from '@/hooks/useImageUpload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Upload, Loader2, X, Pencil, Trash2, Megaphone, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Promo } from '@/types/site';

interface PromoFormState {
  id: string | null;
  link: string;
  is_active: boolean;
  image_url: string;
}

const EMPTY_FORM: PromoFormState = {
  id: null,
  link: '/produits?promotions=true',
  is_active: true,
  image_url: '',
};

export default function AdminPromos() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { data: promos = [], isLoading } = useAllPromos();
  const createPromo = useCreatePromo();
  const updatePromo = useUpdatePromo();
  const deletePromo = useDeletePromo();
  const { uploadImage, uploading } = useImageUpload();

  const [form, setForm] = useState<PromoFormState>(EMPTY_FORM);
  const [isEditing, setIsEditing] = useState(false);
  const [imagePreview, setImagePreview] = useState('');

  // Liste ordonnée localement pour le drag & drop
  const [orderedPromos, setOrderedPromos] = useState<Promo[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
    else if (!authLoading && !isAdmin) navigate('/acces-refuse');
  }, [user, isAdmin, authLoading, navigate]);

  useEffect(() => {
    setOrderedPromos(promos);
  }, [promos]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setImagePreview('');
    setIsEditing(false);
  };

  const startEdit = (p: Promo) => {
    setForm({
      id: p.id,
      link: p.link,
      is_active: p.is_active,
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

    const payload = {
      // Badge/titre/sous-titre ne sont plus saisis dans l'admin :
      // la pub est une image plein cadre. Titre garde une valeur par défaut
      // pour la contrainte NOT NULL de la table.
      badge: null,
      title: 'Promotion',
      subtitle: null,
      link: form.link,
      is_active: form.is_active,
      image_url: form.image_url,
    };

    try {
      if (isEditing && form.id) {
        await updatePromo.mutateAsync({ id: form.id, ...payload });
      } else {
        await createPromo.mutateAsync(payload);
      }
      resetForm();
    } catch {
      // Le toast d'erreur est déjà affiché par le hook (usePromos).
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette publicité ?')) return;
    try {
      await deletePromo.mutateAsync(id);
    } catch {
      // Toast déjà affiché par le hook.
    }
  };

  const toggleActive = (p: Promo) => {
    updatePromo.mutate({ id: p.id, is_active: !p.is_active });
  };

  /** Dépose l'élément déplacé et met à jour les sort_order. */
  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }

    const next = [...orderedPromos];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);

    setOrderedPromos(next);

    // Persiste le nouvel ordre (sort_order = position dans la liste).
    next.forEach((p, i) => {
      if (p.sort_order !== i) {
        updatePromo.mutate({ id: p.id, sort_order: i });
      }
    });

    setDragIndex(null);
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
                  <Label>Image</Label>
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

                <div className="space-y-2"><Label>Lien</Label><Input value={form.link} onChange={e => setForm(f => ({ ...f, link: e.target.value }))} placeholder="/produits?promotions=true" className="border-pink-200" /></div>

                <div className="flex items-end">
                  {/* Pas de <label> HTML ici : le switch Radix porte déjà un aria-label explicite. */}
                  <span className="flex items-center gap-2 pb-2">
                    <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} aria-label="Activer la publicité" />
                    <span className="text-sm text-pink-700">Active</span>
                  </span>
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

          {/* Liste des pubs — drag & drop pour l'ordre d'affichage */}
          <div className="space-y-3">
            <p className="text-sm text-pink-500 text-center">
              Glissez les publicités pour changer leur ordre d'affichage.
            </p>
            {orderedPromos.length === 0 && (
              <p className="text-center text-pink-400 py-8">Aucune publicité. Ajoutez-en une ci-dessus.</p>
            )}
            {orderedPromos.map((p, i) => (
              <Card
                key={p.id}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(i)}
                className={cn(
                  "border-pink-100 cursor-grab active:cursor-grabbing select-none",
                  !p.is_active && "opacity-60",
                  dragIndex === i && "ring-2 ring-pink-300"
                )}
              >
                <CardContent className="flex items-center gap-4 py-4">
                  <GripVertical className="h-5 w-5 text-pink-300 shrink-0" />
                  <div className="h-14 w-14 rounded-xl bg-pink-50 overflow-hidden border border-pink-100 shrink-0">
                    {p.image_url ? <img src={p.image_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Megaphone className="h-6 w-6 text-pink-300" /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-pink-900 truncate">Publicité {i + 1}</p>
                    <p className="text-xs text-pink-500 truncate">{p.link}</p>
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
