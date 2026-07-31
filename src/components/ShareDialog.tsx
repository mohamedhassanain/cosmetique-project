import * as React from "react";
import { useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";

interface ShareDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  title?: string;
  text?: string;
}

export function ShareDialog({ isOpen, onOpenChange, url, title, text }: Readonly<ShareDialogProps>) {
  const handleCopy = React.useCallback(() => {
    globalThis.navigator.clipboard.writeText(url);
    toast.success("Lien copié !");
    onOpenChange(false);
  }, [url, onOpenChange]);

  const shareOptions = React.useMemo(() => [
    {
      name: "WhatsApp",
      icon: <MessageCircle className="h-5 w-5" />,
      color: "bg-[#25D366]",
      action: () => {
        const textToShare = title ? `${title} ${url}` : url;
        globalThis.open(`https://wa.me/?text=${encodeURIComponent(textToShare)}`, "_blank");
        onOpenChange(false);
      },
    },
    {
      name: "Facebook",
      icon: (
        <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      ),
      color: "bg-[#1877F2]",
      action: () => {
        globalThis.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, "_blank");
        onOpenChange(false);
      },
    },
    {
      name: "X (Twitter)",
      icon: (
        <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
          <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932 6.064-6.932zm-1.292 19.494h2.039L6.486 3.24H4.298l13.311 17.407z" />
        </svg>
      ),
      color: "bg-black",
      action: () => {
        const tweetText = title ?? "";
        globalThis.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(tweetText)}`, "_blank");
        onOpenChange(false);
      },
    },
  ], [url, title, onOpenChange]);

  const handleNativeShare = useCallback(async () => {
    if (globalThis.navigator?.share) {
      try {
        await globalThis.navigator.share({
          title,
          text,
          url,
        });
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Error sharing:', error);
        }
      } finally {
        onOpenChange(false);
      }
    }
  }, [title, text, url, onOpenChange]);

  // Automatically trigger native share if available when dialog opens
  useEffect(() => {
    if (isOpen && globalThis.navigator?.share) {
      handleNativeShare();
    }
  }, [isOpen, handleNativeShare]);

  const isNativeShareAvailable = Boolean(globalThis.navigator?.share);

  if (isNativeShareAvailable && isOpen) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-center font-display font-bold text-xl">Partager</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 py-4">
          {!isNativeShareAvailable && (
            <>
              {shareOptions.map((option) => (
                <Button
                  key={option.name}
                  variant="outline"
                  className="flex flex-col items-center gap-2 h-24 rounded-2xl border-2 hover:bg-slate-50 transition-all"
                  onClick={option.action}
                >
                  <div className={`${option.color} p-2 rounded-full text-white`}>
                    {option.icon}
                  </div>
                  <span className="text-xs font-bold">{option.name}</span>
                </Button>
              ))}
              <Button
                variant="outline"
                className="flex flex-col items-center gap-2 h-24 rounded-2xl border-2 hover:bg-slate-50 transition-all"
                onClick={handleCopy}
              >
                <div className="bg-slate-100 p-2 rounded-full">
                  <Copy className="h-6 w-6 text-slate-600" />
                </div>
                <span className="text-xs font-bold">Copier le lien</span>
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
