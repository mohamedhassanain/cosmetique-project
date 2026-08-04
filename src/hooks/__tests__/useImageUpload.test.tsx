import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import imageCompression from 'browser-image-compression';
import { optimizeImage, isWebPSupported } from '../useImageUpload';

vi.mock('browser-image-compression', () => ({
  default: vi.fn(),
}));

const mockedCompression = vi.mocked(imageCompression);

function makeFile(name: string, type: string): File {
  return new File([new Uint8Array(64)], name, { type });
}

describe('optimizeImage', () => {
  beforeEach(() => {
    mockedCompression.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('appelle browser-image-compression avec les options d’optimisation (1600px, ~300 Ko, WebP si supporté)', async () => {
    const original = makeFile('photo.png', 'image/png');
    mockedCompression.mockResolvedValue(original);

    await optimizeImage(original);

    expect(mockedCompression).toHaveBeenCalledWith(
      original,
      expect.objectContaining({
        maxWidthOrHeight: 1600,
        maxSizeMB: 0.3,
        useWebWorker: true,
        fileType: expect.any(String),
      })
    );
  });

  it('retourne un fichier avec l’extension .jpeg quand le navigateur ne supporte pas WebP', async () => {
    // En jsdom, canvas.toDataURL('image/webp') renvoie image/png → support WebP = false.
    expect(isWebPSupported()).toBe(false);

    const original = makeFile('photo.png', 'image/png');
    mockedCompression.mockResolvedValue(original);

    const result = await optimizeImage(original);

    expect(result.name).toBe('photo.jpeg');
    expect(result.type).toBe('image/jpeg');
  });

  it('retourne un fichier avec l’extension .webp quand le navigateur supporte WebP', async () => {
    // Simule le support WebP : canvas.toDataURL renvoie data:image/webp.
    const fakeCanvas = {
      toDataURL: vi.fn(() => 'data:image/webp;base64,xxx'),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(fakeCanvas as unknown as HTMLCanvasElement);
    expect(isWebPSupported()).toBe(true);

    const original = makeFile('photo.jpg', 'image/jpeg');
    mockedCompression.mockResolvedValue(original);

    const result = await optimizeImage(original);

    expect(result.name).toBe('photo.webp');
    expect(result.type).toBe('image/webp');
  });

  it('propage l’erreur quand la compression échoue (l’appelant retombe sur l’original)', async () => {
    const original = makeFile('photo.png', 'image/png');
    mockedCompression.mockRejectedValue(new Error('compression failed'));

    await expect(optimizeImage(original)).rejects.toThrow('compression failed');
  });
});
