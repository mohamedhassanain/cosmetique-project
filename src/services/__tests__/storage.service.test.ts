import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { assertValidImage, uploadImage, STORAGE_BUCKET, MAX_IMAGE_SIZE_BYTES } from '../storage.service';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: vi.fn(),
    },
  },
}));

const mockedFrom = vi.mocked(supabase.storage.from);

function makeFile(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type });
}

beforeEach(() => {
  mockedFrom.mockReset();
});

describe('assertValidImage', () => {
  it('accepte une image dans la limite de taille', () => {
    expect(() => assertValidImage(makeFile('a.png', 'image/png', 1024))).not.toThrow();
  });

  it('rejette un fichier non-image', () => {
    expect(() => assertValidImage(makeFile('a.txt', 'text/plain', 10))).toThrow(
      /seules les images sont autorisées/i
    );
  });

  it('rejette une image trop volumineuse', () => {
    expect(() => assertValidImage(makeFile('big.png', 'image/png', MAX_IMAGE_SIZE_BYTES + 1))).toThrow(
      /5 Mo/i
    );
  });
});

describe('uploadImage', () => {
  it('uploade dans le bon bucket et retourne l’URL publique', async () => {
    const publicUrl = 'https://supabase.co/storage/v1/object/public/cosmetics-images/products/abc.png';
    const upload = vi.fn((_path: string) => Promise.resolve({ error: null }));
    const getPublicUrl = vi.fn(() => ({ data: { publicUrl } }));

    mockedFrom.mockReturnValue({ upload, getPublicUrl } as never);

    const result = await uploadImage(makeFile('photo.png', 'image/png', 2048), 'products');

    expect(mockedFrom).toHaveBeenCalledWith(STORAGE_BUCKET);
    expect(upload).toHaveBeenCalledOnce();
    const uploadedPath = upload.mock.calls[0][0] as string;
    expect(uploadedPath).toMatch(/^products\//);
    expect(uploadedPath).toMatch(/\.png$/);
    expect(result).toBe(publicUrl);
  });

  it('propage une erreur d’upload', async () => {
    mockedFrom.mockReturnValue({
      upload: vi.fn(() => Promise.resolve({ error: { message: 'storage full' } })),
      getPublicUrl: vi.fn(() => ({ data: { publicUrl: '' } })),
    } as never);

    await expect(uploadImage(makeFile('a.png', 'image/png', 10), 'products')).rejects.toMatchObject({
      message: 'storage full',
    });
  });

  it('rejette un fichier invalide avant d’appeler le storage', async () => {
    await expect(uploadImage(makeFile('a.txt', 'text/plain', 10), 'products')).rejects.toThrow(
      /seules les images sont autorisées/i
    );
    expect(mockedFrom).not.toHaveBeenCalled();
  });
});
