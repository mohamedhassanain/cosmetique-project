import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { sendSentryFeedback } from '@/integrations/sentry';
import { Loader2, Paperclip, X, Film } from 'lucide-react';

const SUCCESS_MESSAGE = 'Merci pour votre retour. Notre équipe analysera ce problème.';
const ERROR_MESSAGE = "Votre signalement n'a pas pu être envoyé. Réessayez plus tard.";
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_SIZE_MB = 10;

const ACCEPTED_TYPES = ['image/', 'video/'];

interface AttachmentPreview {
  file: File;
  previewUrl: string;
  isVideo: boolean;
}

function isAcceptedFile(file: File): boolean {
  return ACCEPTED_TYPES.some((prefix) => file.type.startsWith(prefix));
}

/**
 * Formulaire de signalement permettant de joindre des images/vidéos depuis
 * le local. Envoi via le SDK officiel Sentry (`captureFeedback` + attachments).
 *
 * Aucune donnée n'est écrite dans Supabase : tout part exclusivement vers Sentry.
 */
export function SentryFeedbackDialog({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<AttachmentPreview[]>([]);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setName('');
    setEmail('');
    setMessage('');
    setAttachments((prev) => {
      prev.forEach((a) => URL.revokeObjectURL(a.previewUrl));
      return [];
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const incoming = Array.from(files).filter((file) => {
      if (!isAcceptedFile(file)) {
        toast.error(`« ${file.name} » : seules les images et vidéos sont acceptées.`);
        return false;
      }
      if (file.size > MAX_ATTACHMENT_SIZE_MB * 1024 * 1024) {
        toast.error(`« ${file.name} » dépasse la limite de ${MAX_ATTACHMENT_SIZE_MB} Mo.`);
        return false;
      }
      return true;
    });

    const roomLeft = MAX_ATTACHMENTS - attachments.length;
    const toAdd = incoming.slice(0, roomLeft);
    if (toAdd.length < incoming.length) {
      toast.error(`Maximum ${MAX_ATTACHMENTS} fichiers joints.`);
    }

    if (toAdd.length === 0) return;

    setAttachments((prev) => [
      ...prev,
      ...toAdd.map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
        isVideo: file.type.startsWith('video/'),
      })),
    ]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].previewUrl);
      next.splice(index, 1);
      return next;
    });
  };

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (trimmed.length < 10) {
      toast.error('Veuillez décrire le problème (10 caractères minimum).');
      return;
    }
    if (sending) return;

    setSending(true);
    try {
      await sendSentryFeedback(
        {
          message: trimmed,
          name: name.trim() || undefined,
          email: email.trim() || undefined,
          attachments: attachments.map((a) => a.file),
        },
        {
          onSubmitted: () => toast.success(SUCCESS_MESSAGE),
          onError: () => toast.error(ERROR_MESSAGE),
        }
      );
      handleClose(false);
    } catch {
      // Échec déjà signalé via onError (toast).
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg rounded-3xl border-pink-100 shadow-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display font-bold text-pink-900 flex items-center gap-2">
            🐞 Signaler un problème
          </DialogTitle>
          <DialogDescription className="text-pink-500">
            Votre signalement est envoyé directement à notre équipe technique.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="feedback-name">Votre nom (optionnel)</Label>
              <Input
                id="feedback-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Votre nom"
                className="border-pink-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="feedback-email">Votre email (optionnel)</Label>
              <Input
                id="feedback-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.com"
                className="border-pink-200"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="feedback-message">Décrivez le problème rencontré *</Label>
            <Textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ex. : la page ne charge pas, une image ne s'affiche pas…"
              rows={4}
              className="border-pink-200 resize-none"
            />
          </div>

          {/* Pièces jointes : image / vidéo depuis le local */}
          <div className="space-y-2">
            <Label>Ajouter une image ou une vidéo (optionnel)</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              className="border-pink-200 text-pink-600 hover:bg-pink-50 w-full gap-2 h-10"
              onClick={() => fileInputRef.current?.click()}
              disabled={attachments.length >= MAX_ATTACHMENTS}
            >
              <Paperclip className="h-4 w-4" />
              {attachments.length >= MAX_ATTACHMENTS
                ? `Maximum ${MAX_ATTACHMENTS} fichiers atteint`
                : `Choisir des fichiers (max ${MAX_ATTACHMENT_SIZE_MB} Mo, ${MAX_ATTACHMENTS} max)`}
            </Button>

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {attachments.map((attachment, i) => (
                  <div key={attachment.previewUrl} className="relative h-20 w-20 rounded-xl overflow-hidden border border-pink-100 bg-pink-50">
                    {attachment.isVideo ? (
                      <video src={attachment.previewUrl} className="w-full h-full object-cover" muted />
                    ) : (
                      <img src={attachment.previewUrl} alt="" className="w-full h-full object-cover" />
                    )}
                    {attachment.isVideo && (
                      <span className="absolute bottom-1 right-1 bg-white/80 rounded p-0.5">
                        <Film className="h-3.5 w-3.5 text-pink-400" />
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label={`Retirer ${attachment.file.name}`}
                      onClick={() => removeAttachment(i)}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-400 text-white flex items-center justify-center shadow cursor-pointer hover:bg-red-500 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 border-pink-200 text-pink-600"
              onClick={() => handleClose(false)}
              disabled={sending}
            >
              Annuler
            </Button>
            <Button
              type="button"
              className="flex-1 bg-pink-400 hover:bg-pink-500 text-white rounded-full"
              onClick={handleSubmit}
              disabled={sending || message.trim().length < 10}
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Envoi...
                </>
              ) : (
                'Envoyer le signalement'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
