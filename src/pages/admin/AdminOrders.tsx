import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/providers/auth-utils';
import { useOrders, useCreateOrder } from '@/hooks/useOrders';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, ShoppingCart, CheckCircle2, Clock, XCircle, Save, Edit3, Trash2, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function AdminOrders() {
  const { user, loading: authLoading } = useAuth();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { orders, total, totalPages, currentPage, isLoading, updateOrderStatus, deleteOrder, invalidate } = useOrders({
    page,
    pageSize: 20,
    status: statusFilter === 'all' ? undefined : statusFilter,
  });
  const createOrder = useCreateOrder();
  const navigate = useNavigate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCity, setEditCity] = useState('');

  // Dialog « Ajouter une commande »
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createCity, setCreateCity] = useState('');
  const [createProduct, setCreateProduct] = useState('');
  const [createQty, setCreateQty] = useState('1');
  const [createTotal, setCreateTotal] = useState('');
  const [createStatus, setCreateStatus] = useState('pending');
  const [createNotes, setCreateNotes] = useState('');

  // Confirmation de suppression
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const resetCreateForm = () => {
    setCreateName(''); setCreatePhone(''); setCreateCity('');
    setCreateProduct(''); setCreateQty('1'); setCreateTotal('');
    setCreateStatus('pending'); setCreateNotes('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const quantity = Number.parseInt(createQty, 10);
    const total = Number.parseFloat(createTotal);
    if (!createProduct.trim()) { toast.error('Le nom du produit est requis'); return; }
    if (!Number.isFinite(quantity) || quantity < 1) { toast.error('Quantité invalide'); return; }
    if (!Number.isFinite(total) || total < 0) { toast.error('Total invalide'); return; }

    try {
      await createOrder.mutateAsync({
        product_name: createProduct.trim(),
        customer_name: createName.trim() || 'Saisie manuelle',
        customer_phone: createPhone.trim(),
        customer_city: createCity.trim() || null,
        quantity,
        total_price: total,
        status: createStatus,
        notes: createNotes.trim() || null,
      });
      setCreateOpen(false);
      resetCreateForm();
    } catch {
      // L'erreur est déjà affichée par le hook (toast).
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteOrder.mutateAsync(deleteId);
      setDeleteId(null);
    } catch {
      // L'erreur est déjà affichée par le hook (toast).
    }
  };

  // Si le filtre de statut change, on revient à la première page.
  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [user, authLoading, navigate]);

  const statusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge className="bg-yellow-100 text-yellow-700 border-none"><Clock className="h-3 w-3 mr-1" />En attente</Badge>;
      case 'completed': return <Badge className="bg-green-100 text-green-700 border-none"><CheckCircle2 className="h-3 w-3 mr-1" />Terminée</Badge>;
      case 'cancelled': return <Badge className="bg-red-100 text-red-700 border-none"><XCircle className="h-3 w-3 mr-1" />Annulée</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'border-yellow-200';
      case 'completed': return 'border-green-200';
      case 'cancelled': return 'border-red-200';
      default: return 'border-pink-100';
    }
  };

  const startEditing = (order: typeof orders[0]) => {
    setEditingId(order.id);
    setEditName(order.customer_name);
    setEditPhone(order.customer_phone);
    setEditCity(order.customer_city || '');
  };

  const cancelEditing = () => setEditingId(null);

  const saveEdit = async (id: string) => {
    const { error } = await supabase
      .from('orders')
      .update({ customer_name: editName.trim(), customer_phone: editPhone.trim(), customer_city: editCity.trim() || null })
      .eq('id', id);

    if (error) {
      toast.error(`Erreur: ${error.message}`);
      return;
    }
    toast.success('Commande mise à jour');
    void invalidate();
    setEditingId(null);
  };

  const handleStatusChange = (id: string, newStatus: string) => {
    updateOrderStatus.mutate({ id, status: newStatus });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-rose-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild><Link to="/admin"><ArrowLeft className="h-5 w-5" /></Link></Button>
            <h1 className="text-2xl font-display font-bold text-pink-900">Commandes</h1>
          </div>
          <Button
            className="bg-pink-400 hover:bg-pink-500 text-white rounded-full shadow-lg"
            onClick={() => { resetCreateForm(); setCreateOpen(true); }}
          >
            <Plus className="h-4 w-4 mr-2" />Ajouter
          </Button>
        </div>

        {/* Filtre par statut */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
            <SelectTrigger className="w-[200px] bg-white border-pink-200 h-9">
              <SelectValue placeholder="Tous les statuts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="pending">En attente</SelectItem>
              <SelectItem value="completed">Terminée</SelectItem>
              <SelectItem value="cancelled">Annulée</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-pink-600">{total} commande(s)</p>
        </div>

        {isLoading && <div className="space-y-4">{['a','b','c'].map(k => <Skeleton key={k} className="h-24 rounded-2xl" />)}</div>}

        <div className="space-y-4">
          {orders.map(order => (
            <Card key={order.id} className={`border ${statusColor(order.status)}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <ShoppingCart className="h-4 w-4 text-pink-400 shrink-0" />
                      <span className="font-semibold text-pink-900 truncate">{order.product_name}</span>
                      {statusBadge(order.status)}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-pink-600">
                      {editingId === order.id ? (
                        <>
                          <div className="space-y-1 col-span-2">
                            <label htmlFor="edit-order-name" className="text-xs text-pink-400">Client</label>
                            <Input id="edit-order-name" value={editName} onChange={e => setEditName(e.target.value)} className="border-pink-200 h-8 text-sm" />
                          </div>
                          <div className="space-y-1">
                            <label htmlFor="edit-order-phone" className="text-xs text-pink-400">Téléphone</label>
                            <Input id="edit-order-phone" value={editPhone} onChange={e => setEditPhone(e.target.value)} className="border-pink-200 h-8 text-sm" />
                          </div>
                          <div className="space-y-1">
                            <label htmlFor="edit-order-city" className="text-xs text-pink-400">Ville</label>
                            <Input id="edit-order-city" value={editCity} onChange={e => setEditCity(e.target.value)} className="border-pink-200 h-8 text-sm" />
                          </div>
                        </>
                      ) : (
                        <>
                          <p>Client: {order.customer_name}</p>
                          <p>Tél: {order.customer_phone}</p>
                        </>
                      )}
                      {order.customer_city && <p>Ville: {order.customer_city}</p>}
                      <p>Qté: {order.quantity}</p>
                      <p className="font-bold text-pink-900">Total: {order.total_price} DH</p>
                      <p className="text-xs text-pink-400">{new Date(order.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    {order.notes && <p className="text-xs text-pink-400 mt-1">Note: {order.notes}</p>}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0 min-w-[130px]">
                    <Select value={order.status} onValueChange={(val) => handleStatusChange(order.id, val)}>
                      <SelectTrigger className={`h-8 text-xs ${order.status === 'completed' ? 'border-green-200' : order.status === 'cancelled' ? 'border-red-200' : 'border-yellow-200'}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">En attente</SelectItem>
                        <SelectItem value="completed">Terminée</SelectItem>
                        <SelectItem value="cancelled">Annulée</SelectItem>
                      </SelectContent>
                    </Select>

                    {editingId === order.id ? (
                      <>
                        <Button size="sm" className="bg-pink-400 hover:bg-pink-500 text-white h-8 text-xs" onClick={() => saveEdit(order.id)}>
                          <Save className="h-3 w-3 mr-1" />Sauvegarder
                        </Button>
                        <Button size="sm" variant="ghost" className="text-pink-500 h-8 text-xs" onClick={cancelEditing}>
                          Annuler
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" className="border-pink-200 text-pink-600 h-8 text-xs" onClick={() => startEditing(order)}>
                        <Edit3 className="h-3 w-3 mr-1" />Modifier
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-200 text-red-400 hover:bg-red-50 h-8 text-xs"
                      onClick={() => setDeleteId(order.id)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />Supprimer
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {!isLoading && orders.length === 0 && (
          <div className="text-center py-16">
            <ShoppingCart className="h-12 w-12 text-pink-200 mx-auto mb-4" />
            <p className="text-pink-500">Aucune commande pour le moment</p>
          </div>
        )}

        {/* Dialog : ajouter une commande */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-pink-900">Ajouter une commande</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="create-product">Produit *</Label>
                <Input id="create-product" value={createProduct} onChange={e => setCreateProduct(e.target.value)} placeholder="Crème visage" className="border-pink-200" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="create-name">Client</Label>
                  <Input id="create-name" value={createName} onChange={e => setCreateName(e.target.value)} placeholder="Nom du client" className="border-pink-200" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="create-phone">Téléphone</Label>
                  <Input id="create-phone" value={createPhone} onChange={e => setCreatePhone(e.target.value)} placeholder="+2126..." className="border-pink-200" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="create-qty">Qté</Label>
                  <Input id="create-qty" type="number" min="1" value={createQty} onChange={e => setCreateQty(e.target.value)} className="border-pink-200" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label htmlFor="create-total">Total (DH)</Label>
                  <Input id="create-total" type="number" step="0.01" min="0" value={createTotal} onChange={e => setCreateTotal(e.target.value)} placeholder="199" className="border-pink-200" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-city">Ville</Label>
                <Input id="create-city" value={createCity} onChange={e => setCreateCity(e.target.value)} placeholder="Casablanca" className="border-pink-200" />
              </div>
              <div className="space-y-1.5">
                <Label>Statut</Label>
                <Select value={createStatus} onValueChange={setCreateStatus}>
                  <SelectTrigger className="border-pink-200"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">En attente</SelectItem>
                    <SelectItem value="completed">Terminée</SelectItem>
                    <SelectItem value="cancelled">Annulée</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-notes">Notes</Label>
                <Input id="create-notes" value={createNotes} onChange={e => setCreateNotes(e.target.value)} placeholder="Note interne" className="border-pink-200" />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} className="border-pink-200">Annuler</Button>
                <Button type="submit" disabled={createOrder.isPending} className="bg-pink-400 hover:bg-pink-500 text-white">
                  {createOrder.isPending ? 'Ajout...' : 'Ajouter'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Confirmation de suppression */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer cette commande ?</AlertDialogTitle>
              <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">Supprimer</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-10">
            <Button
              variant="outline"
              size="icon"
              className="border-pink-200 text-pink-600"
              disabled={currentPage <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-pink-600 font-medium">
              Page {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="border-pink-200 text-pink-600"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
