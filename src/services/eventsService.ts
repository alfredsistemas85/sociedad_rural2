import { supabase } from '../lib/supabaseClient';

export interface EventoSocial {
  id: string;
  titulo: string;
  descripcion_limpia?: string;
  lugar?: string;
  fecha_evento?: string;
  hora_evento?: string;
  imagen_url?: string;
  status: string;
}

export interface Evento {
  id: string;
  titulo: string;
  descripcion?: string;
  lugar: string;
  fecha: string;
  hora: string;
  tipo: string;
  imagen_url?: string;
  municipio?: string;
}

export const eventsService = {
  async getPublicEvents(municipio?: string, tipo?: string) {
    // 1. Fetch institutional events
    let eq = supabase.from('eventos').select('*').order('fecha', { ascending: true });
    if (municipio) eq = eq.ilike('lugar', `%${municipio}%`);
    if (tipo) eq = eq.ilike('tipo', `%${tipo}%`);
    const { data: instEvents, error: err1 } = await eq;
    if (err1) throw err1;

    // 2. Fetch approved social events
    let sq = supabase.from('eventos_sociales').select('*').eq('status', 'aprobado').order('fecha_evento', { ascending: true });
    if (municipio) sq = sq.ilike('lugar', `%${municipio}%`);
    if (tipo) sq = sq.ilike('titulo', `%${tipo}%`);
    const { data: socEvents, error: err2 } = await sq;
    if (err2) throw err2;

    // Normalize
    const normalizedSocial = (socEvents || []).map((ev: any) => ({
      ...ev,
      descripcion: ev.descripcion_limpia,
      lugar: ev.lugar || 'A definir',
      fecha: ev.fecha_evento,
      hora: ev.hora_evento,
      tipo: 'Social'
    }));

    // Combine & Sort
    const combined = [...(instEvents || []), ...normalizedSocial];
    combined.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

    return combined;
  },

  async getAdminInstEvents(limit=50, offset=0) {
    const { data, error } = await supabase.from('eventos').select('*').range(offset, offset + limit - 1).order('fecha', { ascending: false });
    if (error) throw error;
    return data;
  },

  async getAdminSocialEvents(limit=50, offset=0) {
    const { data, error } = await supabase.from('eventos_sociales').select('*').range(offset, offset + limit - 1).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async createInstEvent(evento: Partial<Evento>) {
    const { data, error } = await supabase.from('eventos').insert(evento).select().single();
    if (error) throw error;
    return data;
  },

  async updateInstEvent(id: string, updates: Partial<Evento>) {
    const { data, error } = await supabase.from('eventos').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async deleteInstEvent(id: string) {
    const { error } = await supabase.from('eventos').delete().eq('id', id);
    if (error) throw error;
    return true;
  },

  async updateSocialEventStatus(id: string, status: string) {
    const { data, error } = await supabase.from('eventos_sociales').update({ status }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async updateSocialEvent(id: string, updates: Partial<EventoSocial>) {
    const { data, error } = await supabase.from('eventos_sociales').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async deleteSocialEvent(id: string) {
    const { error } = await supabase.from('eventos_sociales').delete().eq('id', id);
    if (error) throw error;
    return true;
  }
};
