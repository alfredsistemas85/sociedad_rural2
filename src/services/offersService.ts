import { supabase } from '../lib/supabaseClient';

export interface Oferta {
  id: string;
  comercio_id?: string;
  titulo: string;
  descripcion?: string;
  tipo: 'promocion' | 'descuento' | 'beneficio';
  descuento_porcentaje?: number;
  imagen_url?: string;
  fecha_inicio?: string;
  fecha_fin?: string;
  activo?: boolean;
}

export const offersService = {
  async getPublicOffers(municipio?: string, limit = 50, offset = 0) {
    let query = supabase
      .from('ofertas')
      .select('*, profiles!comercio_id(nombre_apellido, municipio, rubro)')
      .eq('activo', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (municipio) {
      query = query.eq('profiles.municipio', municipio);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async getMyOffers(comercio_id: string) {
    const { data, error } = await supabase
      .from('ofertas')
      .select('*')
      .eq('comercio_id', comercio_id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  async createOffer(comercio_id: string, oferta: Partial<Oferta>) {
    const { data, error } = await supabase
      .from('ofertas')
      .insert({ ...oferta, comercio_id, activo: true })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateOffer(id: string, comercio_id: string, updates: Partial<Oferta>) {
    const { data, error } = await supabase
      .from('ofertas')
      .update(updates)
      .eq('id', id)
      .eq('comercio_id', comercio_id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteOffer(id: string, comercio_id: string) {
    const { error } = await supabase
      .from('ofertas')
      .delete()
      .eq('id', id)
      .eq('comercio_id', comercio_id);

    if (error) throw error;
    return true;
  },

  async uploadOfferImage(comercio_id: string, file: File) {
    try {
      // Proactive check: Ensure the bucket exists (helpful for debugging/consistency)
      const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
      if (!bucketError && !buckets.find(b => b.id === 'business-logos')) {
        console.warn('Bucket "business-logos" not found. Attempting to proceed anyway as it might be a cache issue.');
      }

      const fileExt = file.name.split('.').pop();
      const filename = `${comercio_id}/${crypto.randomUUID()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('business-logos')
        .upload(filename, file, {
          upsert: true,
          contentType: file.type
        });

      if (uploadError) {
        if (uploadError.message.includes('Bucket not found')) {
          throw new Error('Error de configuración: El contenedor de imágenes "business-logos" no existe en Supabase. Por favor, créalo en la sección Storage del Dashboard.');
        }
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('business-logos')
        .getPublicUrl(filename);

      return publicUrl;
    } catch (err: any) {
      console.error('Error in uploadOfferImage:', err);
      throw new Error(err.message || 'Error al subir la imagen de la oferta');
    }
  }
};
