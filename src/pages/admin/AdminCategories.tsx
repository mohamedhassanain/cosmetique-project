import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/providers/auth-utils';
import { useCategories, useSubcategories } from '@/hooks/useCategories';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ArrowLeft, Plus, Edit, Trash2, FolderOpen, Tag } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminCategories() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { categories, isLoading, createCategory, updateCategory, deleteCategory } = useCategories();
  const navigate = useNavigate();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<typeof categories[0] | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categorySlug, setCategorySlug] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
    else if (!authLoading && !isAdmin) navigate('/acces-refuse');
  }, [user, isAdmin, authLoading, navigate]);

  const handleOpenDialog = (cat?: typeof categories[0]) => {
    if (cat) {
      setEditingCategory(cat);
      setCategoryName(cat.name);
      setCategorySlug(cat.slug);
    } else {
      setEditingCategory(null);
      setCategoryName('');
      setCategorySlug('');
    }
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!categoryName.trim()) { toast.error('Nom requis'); return; }
    const slug = categorySlug.trim() || categoryName.toLowerCase().normalize('NFD').replaceAll(/[\u0300-\u036f]/g, '').replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/(^-)|(-$)/g, '');
    try {
      if (editingCategory) {
        await updateCategory.mutateAsync({ id: editingCategory.id, name: categoryName.trim(), slug });
      } else {
        await createCategory.mutateAsync({ name: categoryName.trim(), slug });
      }
      setDialogOpen(false);
      setCategoryName('');
      setCategorySlug('');
      setEditingCategory(null);
    } catch {
      // L'erreur est déjà affichée par le hook (toast) — on évite un rejet non géré.
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-rose-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" asChild><Link to="/admin"><ArrowLeft className="h-5 w-5" /></Link></Button>
          <div className="flex-1">
            <h1 className="text-2xl font-display font-bold text-pink-900">Catégories</h1>
            <p className="text-pink-500">{categories.length} catégorie(s)</p>
          </div>
          <Button onClick={() => handleOpenDialog()} className="bg-pink-400 hover:bg-pink-500 text-white rounded-full">
            <Plus className="h-4 w-4 mr-2" />Ajouter
          </Button>
        </div>

        {isLoading && <div className="space-y-4">{['a','b','c'].map(k => <Skeleton key={k} className="h-16 rounded-2xl" />)}</div>}

        {categories.length === 0 && !isLoading && (
          <Card className="border-dashed border-pink-200">
            <CardContent className="py-12 text-center">
              <FolderOpen className="h-12 w-12 text-pink-200 mx-auto mb-4" />
              <p className="text-pink-500">Aucune catégorie</p>
              <Button onClick={() => handleOpenDialog()} className="mt-4 bg-pink-300 hover:bg-pink-400 text-white rounded-full">
                <Plus className="h-4 w-4 mr-2" />Créer
              </Button>
            </CardContent>
          </Card>
        )}

        <Accordion type="multiple" className="space-y-4">
          {categories.map(cat => (
            <CategoryAccordionItem key={cat.id} category={cat} onEdit={() => handleOpenDialog(cat)} onDelete={() => setDeleteId(cat.id)} />
          ))}
        </Accordion>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-pink-900">{editingCategory ? 'Modifier' : 'Nouvelle'} catégorie</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input placeholder="Nom" value={categoryName} onChange={e => setCategoryName(e.target.value)} className="border-pink-200" />
            <Input placeholder="Slug (ex: soins-visage)" value={categorySlug} onChange={e => setCategorySlug(e.target.value)} className="border-pink-200" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-pink-200">Annuler</Button>
            <Button onClick={handleSubmit} disabled={createCategory.isPending || updateCategory.isPending} className="bg-pink-400 hover:bg-pink-500 text-white">
              {editingCategory ? 'Mettre à jour' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Supprimer ?</AlertDialogTitle>
          <AlertDialogDescription>Les sous-catégories seront aussi supprimées.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (!deleteId) return;
              try {
                await deleteCategory.mutateAsync(deleteId);
                setDeleteId(null);
              } catch {
                // L'erreur est déjà affichée par le hook (toast).
              }
            }} className="bg-red-500">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CategoryAccordionItem({ category, onEdit, onDelete }: { category: { id: string; name: string; slug: string }; onEdit: () => void; onDelete: () => void }) {
  const { subcategories, createSubcategory, updateSubcategory, deleteSubcategory } = useSubcategories(category.id);
  const [subDialogOpen, setSubDialogOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<{ id: string; name: string } | null>(null);
  const [subName, setSubName] = useState('');
  const [deleteSubId, setDeleteSubId] = useState<string | null>(null);

  const handleSubSubmit = async () => {
    if (!subName.trim()) { toast.error('Nom requis'); return; }
    try {
      if (editingSub) {
        await updateSubcategory.mutateAsync({ id: editingSub.id, name: subName.trim() });
      } else {
        await createSubcategory.mutateAsync({ catId: category.id, name: subName.trim() });
      }
      setSubDialogOpen(false);
      setSubName('');
      setEditingSub(null);
    } catch {
      // L'erreur est déjà affichée par le hook (toast).
    }
  };

  return (
    <>
      <AccordionItem value={category.id} className="border-2 border-pink-100 rounded-xl px-4 bg-white">
        <AccordionTrigger className="hover:no-underline py-4">
          <div className="flex items-center gap-3 flex-1">
            <FolderOpen className="h-5 w-5 text-pink-400" />
            <span className="font-semibold text-pink-900">{category.name}</span>
            <span className="text-sm text-pink-400">({subcategories.length})</span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-4">
          <div className="flex gap-2 mb-4">
            <Button variant="outline" size="sm" className="border-pink-200 text-pink-600 h-8 px-2" onClick={onEdit}><Edit className="h-3 w-3 mr-1" />Modifier</Button>
            <Button variant="outline" size="sm" className="border-red-200 text-red-400 h-8 px-2" onClick={onDelete}><Trash2 className="h-3 w-3 mr-1" />Supprimer</Button>
            <Button variant="secondary" size="sm" className="bg-pink-100 text-pink-700 ml-auto h-8 px-2" onClick={() => { setEditingSub(null); setSubName(''); setSubDialogOpen(true); }}>
              <Plus className="h-3 w-3 mr-1" />Sous-catégorie
            </Button>
          </div>
          {subcategories.map(sub => (
            <div key={sub.id} className="flex items-center justify-between p-2 rounded-lg bg-pink-50/50 mb-2">
              <span className="text-sm text-pink-700 flex items-center gap-2"><Tag className="h-3 w-3 text-pink-300" />{sub.name}</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingSub({ id: sub.id, name: sub.name }); setSubName(sub.name); setSubDialogOpen(true); }}><Edit className="h-3 w-3 text-pink-400" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteSubId(sub.id)}><Trash2 className="h-3 w-3 text-red-400" /></Button>
              </div>
            </div>
          ))}
        </AccordionContent>
      </AccordionItem>

      <Dialog open={subDialogOpen} onOpenChange={setSubDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-pink-900">{editingSub ? 'Modifier' : 'Nouvelle'} sous-catégorie</DialogTitle></DialogHeader>
          <Input value={subName} onChange={e => setSubName(e.target.value)} placeholder="Nom" className="border-pink-200" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubDialogOpen(false)} className="border-pink-200">Annuler</Button>
            <Button onClick={handleSubSubmit} disabled={createSubcategory.isPending || updateSubcategory.isPending} className="bg-pink-400 hover:bg-pink-500 text-white">
              {editingSub ? 'Mettre à jour' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteSubId} onOpenChange={() => setDeleteSubId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Supprimer ?</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (!deleteSubId) return;
              try {
                await deleteSubcategory.mutateAsync(deleteSubId);
                setDeleteSubId(null);
              } catch {
                // L'erreur est déjà affichée par le hook (toast).
              }
            }} className="bg-red-500">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
