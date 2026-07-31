import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/auth-utils';
import { useOrders } from '@/hooks/useOrders';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, ShoppingCart, CheckCircle2, Clock, XCircle, Save, Edit3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

export default function AdminOrders() {
  const { user, loading: authLoading } = useAuth();
  const { orders, isLoading, updateOrderStatus } = useOrders();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

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
  };

  const saveEdit = async (id: string) => {
    const { error } = await supabase
      .from('orders')
      .update({ customer_name: editName.trim(), customer_phone: editPhone.trim() })
      .eq('id', id);

    if (error) {
      toast.error(`Erreur: ${error.message}`);
      return;
    }
    toast.success('Commande mise à jour');
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    setEditingId(null);
  };

  const handleStatusChange = (id: string, newStatus: string) => {
    updateOrderStatus.mutate({ id, status: newStatus });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-rose-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" asChild><Link to="/admin"><ArrowLeft className="h-5 w-5" /></Link></Button>
          <h1 className="text-2xl font-display font-bold text-pink-900">Commandes</h1>
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
                            <label className="text-xs text-pink-400">Client</label>
                            <Input value={editName} onChange={e => setEditName(e.target.value)} className="border-pink-200 h-8 text-sm" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-pink-400">Téléphone</label>
                            <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} className="border-pink-200 h-8 text-sm" />
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
                    <Select
                      value={order.status}
                      onValueChange={(val) => handleStatusChange(order.id, val)}
                    >
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
                      <Button size="sm" className="bg-pink-400 hover:bg-pink-500 text-white h-8 text-xs" onClick={() => saveEdit(order.id)}>
                        <Save className="h-3 w-3 mr-1" />Sauvegarder
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="border-pink-200 text-pink-600 h-8 text-xs" onClick={() => startEditing(order)}>
                        <Edit3 className="h-3 w-3 mr-1" />Modifier
                      </Button>
                    )}
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
      </div>
    </div>
  );
}
