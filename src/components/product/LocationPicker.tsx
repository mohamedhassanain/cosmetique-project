import { Button } from '@/components/ui/button';
import { MapPin } from 'lucide-react';
import { toast } from 'sonner';

interface LocationPickerProps {
  locationUrl: string;
  locationCity: string;
  onLocationChange: (url: string, city: string) => void;
}

export default function LocationPicker({ locationUrl, locationCity, onLocationChange }: LocationPickerProps) {
  const handleGetCurrentPosition = () => {
    if (!navigator.geolocation) {
      toast.error('La géolocalisation n\'est pas supportée par votre navigateur');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        onLocationChange(
          `https://www.google.com/maps?q=${latitude},${longitude}`,
          `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
        );
        toast.success('Position récupérée !');
      },
      () => {
        toast.error('Impossible de récupérer votre position. Vérifiez les autorisations.');
      },
      { enableHighAccuracy: true }
    );
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-pink-900">Ville</span>
        <input
          value={locationCity}
          onChange={e => onLocationChange(locationUrl, e.target.value)}
          placeholder="Casablanca"
          className="w-full h-9 rounded-lg border border-pink-200 bg-white px-3 text-sm text-pink-900 placeholder:text-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-300"
        />
      </div>
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-pink-900">Lien Maps / Waze</span>
        <div className="flex gap-2">
          <input
            value={locationUrl}
            onChange={e => onLocationChange(e.target.value, locationCity)}
            placeholder="https://maps.app.goo.gl/..."
            className="w-full h-9 rounded-lg border border-pink-200 bg-white px-3 text-sm text-pink-900 placeholder:text-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-300 flex-1"
          />
          <Button type="button" variant="outline" className="border-pink-200 text-pink-600 shrink-0 px-2.5 h-9" onClick={handleGetCurrentPosition} title="Récupérer ma position actuelle">
            <MapPin className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}