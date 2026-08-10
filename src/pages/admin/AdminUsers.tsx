import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/providers/auth-utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, ShieldCheck, Users } from 'lucide-react';

export default function AdminUsers() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
    else if (!authLoading && !isAdmin) navigate('/acces-refuse');
  }, [user, isAdmin, authLoading, navigate]);

  if (authLoading || !user || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pink-50">
        <div className="h-12 w-12 border-4 border-pink-300 border-t-pink-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-rose-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" asChild><Link to="/admin"><ArrowLeft className="h-5 w-5" /></Link></Button>
          <div className="flex-1">
            <h1 className="text-2xl font-display font-bold text-pink-900 flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-pink-500" />
              Administrateurs
            </h1>
            <p className="text-pink-500">Gestion des accès</p>
          </div>
        </div>

        <Card className="border-pink-100">
          <CardHeader>
            <CardTitle className="text-pink-900 flex items-center gap-2">
              <Users className="h-5 w-5 text-pink-400" />
              Politique d'accès
            </CardTitle>
            <CardDescription>Mode de sécurité actuel</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-pink-900 bg-pink-50/60 border border-pink-100 p-4 rounded-xl">
              Actuellement, <strong>tous les utilisateurs connectés</strong> possèdent les droits d'administration.
              Il n'est plus nécessaire d'ajouter manuellement des administrateurs.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
