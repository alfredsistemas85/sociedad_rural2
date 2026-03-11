import { createClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const profilesService = {
  async getProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async updateProfile(userId: string, updates: any) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
    if (error) throw new Error(error.message);

    // If email is updated, we also need to update auth user
    if (updates.email) {
      await supabase.auth.updateUser({ email: updates.email });
    }

    return data;
  },

  async getComercios(rubro?: string, municipio?: string) {
    let query = supabase
      .from('profiles')
      .select('id, nombre_apellido, rubro, municipio, telefono, email, foto_url')
      .eq('rol', 'COMERCIO')
      .eq('estado', 'APROBADO')
      .order('nombre_apellido');

    if (rubro) query = query.eq('rubro', rubro);
    if (municipio) query = query.eq('municipio', municipio);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  },

  async uploadProfilePhoto(userId: string, file: File) {
    try {
      // Proactive check: Ensure the bucket exists
      const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
      if (!bucketError && !buckets.find(b => b.id === 'business-logos')) {
        console.warn('Bucket "business-logos" not found. Attempting to proceed anyway.');
      }

      const fileExt = file.name.split('.').pop();
      const filePath = `${userId}/profile.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('business-logos')
        .upload(filePath, file, {
          upsert: true,
          contentType: file.type
        });

      if (uploadError) {
        if (uploadError.message.includes('Bucket not found')) {
          throw new Error('Error de configuración: El contenedor "business-logos" no existe en Supabase.');
        }
        throw new Error(uploadError.message);
      }

      const { data: { publicUrl } } = supabase.storage
        .from('business-logos')
        .getPublicUrl(filePath);

      await this.updateProfile(userId, { foto_url: publicUrl });

      return publicUrl;
    } catch (err: any) {
      console.error('Error in uploadProfilePhoto:', err);
      throw new Error(err.message || 'Error al subir la foto de perfil');
    }
  },

  async getPendingUsers() {
    const { data, error } = await supabase.from('profiles').select('*').eq('estado', 'PENDIENTE');
    if (error) throw error;
    return data;
  },

  async getAllUsers() {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async updateUserStatus(userId: string, status: string) {
    const { data, error } = await supabase.from('profiles').update({ estado: status }).eq('id', userId).select().single();
    if (error) throw error;
    return data;
  },

  async deleteUser(userId: string) {
    const { data, error } = await supabase.from('profiles').delete().eq('id', userId);
    if (error) throw error;
    return data;
  },

  async getMisDependientes(userId: string) {
    const { data, error } = await supabase.from('profiles').select('*').eq('titular_id', userId).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async validateSocio(socioId: string) {
    const { data, error } = await supabase.from('profiles')
      .select('id, nombre_apellido, dni, rol, estado, municipio, titular_id, tipo_vinculo, perfiles_titulares:profiles!titular_id(nombre_apellido, estado)')
      .eq('id', socioId)
      .maybeSingle();

    if (error || !data) throw new Error('El código QR no pertenece a un usuario registrado válido.');

    const perfil = data as any;
    if (!['SOCIO', 'COMERCIO'].includes(perfil.rol)) throw new Error('El código QR no pertenece a un Socio o Comercio válido.');

    let es_activo = perfil.estado === 'APROBADO';
    let mensaje = es_activo ? "✅ Socio Activo. Apto para recibir beneficios." : `❌ Usuario inactivo o estado pendiente (${perfil.estado}).`;

    if (perfil.perfiles_titulares) {
      const titular_valido = perfil.perfiles_titulares.estado === 'APROBADO';
      if (!titular_valido) {
        es_activo = false;
        mensaje = `❌ El titular de este usuario (${perfil.perfiles_titulares.nombre_apellido}) está en estado ${perfil.perfiles_titulares.estado}.`;
      } else {
        const vinculo = perfil.tipo_vinculo ? perfil.tipo_vinculo.charAt(0).toUpperCase() + perfil.tipo_vinculo.slice(1) : "Adherente";
        mensaje = `✅ ${vinculo} Activo. Titular: ${perfil.perfiles_titulares.nombre_apellido}.`;
      }
    }
    return { valido: es_activo, socio: perfil, mensaje };
  },

  async createComercio(data: any) {
    // Creamos una instancia secundaria para NO desloguear al administrador actual
    const tempSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });

    const tempPassword = 'comercio1234';

    // 1. Crear usuario en Auth
    const { data: authData, error: authError } = await tempSupabase.auth.signUp({
      email: data.email,
      password: tempPassword
    });

    if (authError) throw new Error('Error al crear cuenta: ' + authError.message);
    if (!authData.user) throw new Error('No se pudo generar el usuario en Auth.');

    const userId = authData.user.id;

    // 2. Insertar en Profiles (usando el cliente global porque ya tenemos permiso de admin)
    const { data: newProfile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        nombre_apellido: data.nombre_comercio,
        dni: data.cuit,
        email: data.email,
        telefono: data.telefono,
        rubro: data.rubro,
        direccion: data.direccion,
        rol: 'COMERCIO',
        estado: 'PENDIENTE',
        password_changed: false
      })
      .select()
      .single();

    if (profileError) throw new Error('Error al crear perfil: ' + profileError.message);

    // 3. Insertar en tabla Comercios
    const { error: comercioError } = await supabase.from('comercios').insert({
      id: userId,
      nombre_comercio: data.nombre_comercio,
      cuit: data.cuit,
      rubro: data.rubro,
      direccion: data.direccion
    });

    if (comercioError) throw new Error('Error al registrar datos comerciales: ' + comercioError.message);

    return newProfile;
  }
};
