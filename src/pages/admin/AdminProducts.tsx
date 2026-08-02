import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/providers/auth-utils';
import { useProducts, useDeleteProduct } from '@/hooks/useProducts';
import { useCategories, useSubcategories } from '@/hooks/useCategories';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Plus, Search, ArrowLeft, Edit, Trash2, Package, EyeOff, Sparkles, Tag, FolderOpen, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminProducts() {
  const { user, loading: authLoading } = useAuth();
  const { products, isLoading } = useProducts();
  const deleteProduct = useDeleteProduct();
  const { categories, isLoading: catLoading, createCategory, updateCategory, deleteCategory } = useCategories();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<typeof categories[0] | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categorySlug, setCategorySlug] = useState('');
  const [deleteCatId, setDeleteCatId] = useState<string | null>(null);
  const [showCategories, setShowCategories] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [user, authLoading, navigate]);

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.brand || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async () => {
    if (deleteId) {
      await deleteProduct.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  const handleCatDialogOpen = (cat?: typeof categories[0]) => {
    if (cat) {
      setEditingCategory(cat);
      setCategoryName(cat.name);
      setCategorySlug(cat.slug);
    } else {
      setEditingCategory(null);
      setCategoryName('');
      setCategorySlug('');
    }
    setCatDialogOpen(true);
  };

  const handleCatSubmit = async () => {
    if (!categoryName.trim()) { toast.error('Nom requis'); return; }
    const slug = categorySlug.trim() || categoryName.toLowerCase().normalize('NFD').replaceAll(/[\u0300-\u036f]/g, '').replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/(^-)|(-$)/g, '');
    if (editingCategory) {
      await updateCategory.mutateAsync({ id: editingCategory.id, name: categoryName.trim(), slug });
    } else {
      await createCategory.mutateAsync({ name: categoryName.trim(), slug });
    }
    setCatDialogOpen(false);
    setCategoryName('');
    setCategorySlug('');
    setEditingCategory(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-rose-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" asChild><Link to="/admin"><ArrowLeft className="h-5 w-5" /></Link></Button>
          <div className="flex-1">
            <h1 className="text-2xl font-display font-bold text-pink-900">Produits</h1>
            <p className="text-pink-500">{products.length} produit(s)</p>
          </div>
          <Button asChild className="bg-pink-400 hover:bg-pink-500 text-white rounded-full shadow-lg">
            <Link to="/admin/produits/nouveau"><Plus className="h-4 w-4 mr-2" />Ajouter</Link>
          </Button>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-pink-300" />
          <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-white border-pink-200 rounded-full" />
        </div>

        {isLoading && <div className="space-y-4">{['sk1','sk2','sk3'].map(k => <Skeleton key={k} className="h-24 rounded-2xl" />)}</div>}

        <div className="space-y-4">
          {filtered.map(p => {
            const displayImg = p.image_url;
            return (
              <Card key={p.id} className="border-pink-100 hover:shadow-md transition-all">
                <CardContent className="p-4">
                  <div className="flex gap-4 items-center">
                    <div className="w-16 h-16 rounded-xl bg-pink-50 overflow-hidden flex items-center justify-center border border-pink-100 shrink-0">
                      {displayImg ? <img src={displayImg} alt="" className="max-w-full max-h-full object-contain" /> : <Package className="h-8 w-8 text-pink-200" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-pink-900 truncate">{p.name}</h3>
                          <p className="text-sm text-pink-500">{p.price} DH{p.is_promotion && p.original_price && <span className="line-through text-pink-300 ml-2">{p.original_price} DH</span>}</p>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {p.is_featured && <Badge className="bg-pink-100 text-pink-700 border-none text-[10px]"><Sparkles className="h-3 w-3 mr-0.5" />Recommandé</Badge>}
                            {p.is_promotion && <Badge className="bg-red-100 text-red-600 border-none text-[10px]">Promo</Badge>}
                            {!p.is_active && <Badge className="bg-gray-100 text-gray-500 border-none text-[10px]"><EyeOff className="h-3 w-3 mr-0.5" />Masqué</Badge>}
                            {p.categories && <Badge variant="outline" className="text-[10px] border-pink-200 text-pink-600"><Tag className="h-3 w-3 mr-0.5" />{p.categories.name}</Badge>}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-pink-500" onClick={() => navigate(`/admin/produits/${p.id}`)}><Edit className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400" onClick={() => setDeleteId(p.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16">
            <Package className="h-12 w-12 text-pink-200 mx-auto mb-4" />
            <p className="text-pink-500">Aucun produit trouvé</p>
          </div>
        )}

        {/* Catégories Section */}
        <div className="mt-12 border-t border-pink-200 pt-8">
          <button
            onClick={() => setShowCategories(!showCategories)}
            className="flex items-center justify-between w-full mb-4"
          >
            <div className="flex items-center gap-3">
              <FolderOpen className="h-6 w-6 text-pink-400" />
              <h2 className="text-xl font-display font-bold text-pink-900">Catégories & Sous-catégories</h2>
              <span className="text-sm text-pink-400">({categories.length})</span>
            </div>
            <ChevronDown className={`h-5 w-5 text-pink-400 transition-transform ${showCategories ? 'rotate-180' : ''}`} />
          </button>

          {showCategories && (
            <>
              {catLoading ? (
                <div className="space-y-4">{['a','b','c'].map(k => <Skeleton key={k} className="h-16 rounded-2xl" />)}</div>
              ) : (
                <>
                  <div className="flex justify-end mb-4">
                    <Button onClick={() => handleCatDialogOpen()} className="bg-pink-400 hover:bg-pink-500 text-white rounded-full">
                      <Plus className="h-4 w-4 mr-2" />Ajouter une catégorie
                    </Button>
                  </div>

                  <Accordion type="multiple" className="space-y-4">
                    {categories.map(cat => (
                      <CategoryAccordionItem key={cat.id} category={cat} onEdit={() => handleCatDialogOpen(cat)} onDelete={() => setDeleteCatId(cat.id)} />
                    ))}
                  </Accordion>

                  {categories.length === 0 && (
                    <Card className="border-dashed border-pink-200">
                      <CardContent className="py-12 text-center">
                        <FolderOpen className="h-12 w-12 text-pink-200 mx-auto mb-4" />
                        <p className="text-pink-500">Aucune catégorie</p>
                        <Button onClick={() => handleCatDialogOpen()} className="mt-4 bg-pink-300 hover:bg-pink-400 text-white rounded-full">
                          <Plus className="h-4 w-4 mr-2" />Créer
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Delete product dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Supprimer ce produit ?</AlertDialogTitle>
          <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Category dialog */}
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-pink-900">{editingCategory ? 'Modifier' : 'Nouvelle'} catégorie</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input placeholder="Nom" value={categoryName} onChange={e => setCategoryName(e.target.value)} className="border-pink-200" />
            <Input placeholder="Slug (ex: soins-visage)" value={categorySlug} onChange={e => setCategorySlug(e.target.value)} className="border-pink-200" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialogOpen(false)} className="border-pink-200">Annuler</Button>
            <Button onClick={handleCatSubmit} disabled={createCategory.isPending || updateCategory.isPending} className="bg-pink-400 hover:bg-pink-500 text-white">
              {editingCategory ? 'Mettre à jour' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete category dialog */}
      <AlertDialog open={!!deleteCatId} onOpenChange={() => setDeleteCatId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Supprimer ?</AlertDialogTitle>
          <AlertDialogDescription>Les sous-catégories seront aussi supprimées.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { if (deleteCatId) { await deleteCategory.mutateAsync(deleteCatId); setDeleteCatId(null); } }} className="bg-red-500">Supprimer</AlertDialogAction>
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
    if (editingSub) {
      await updateSubcategory.mutateAsync({ id: editingSub.id, name: subName.trim() });
    } else {
      await createSubcategory.mutateAsync({ catId: category.id, name: subName.trim() });
    }
    setSubDialogOpen(false);
    setSubName('');
    setEditingSub(null);
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
            <AlertDialogAction onClick={async () => { if (deleteSubId) { await deleteSubcategory.mutateAsync(deleteSubId); setDeleteSubId(null); } }} className="bg-red-500">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
