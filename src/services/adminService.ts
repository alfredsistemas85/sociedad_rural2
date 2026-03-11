import { supabase } from '../lib/supabaseClient';

export const adminService = {
  async getProfiles() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async updateUserStatus(userId: string, status: string, motivo: string | null = null) {
    const { data, error } = await supabase
      .from('profiles')
      .update({ estado: status, motivo: motivo })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;

    // Log activity
    await supabase.from('activity_log').insert({
      socio_id: userId,
      tipo_evento: 'ESTADO_ACTUALIZADO',
      descripcion: `Estado actualizado a ${status}${motivo ? ': ' + motivo : ''}`,
      usuario_id: (await supabase.auth.getUser()).data.user?.id
    });

    return data;
  },

  async getMetricsOverview() {
    // This ideally should be complex aggregations, but for client-side we can do simple ones.
    const { data: profiles, error } = await supabase.from('profiles').select('estado, rol');
    if (error) throw error;

    const metrics = {
      total_socios: profiles.filter(p => p.rol === 'SOCIO').length,
      socios_activos: profiles.filter(p => p.rol === 'SOCIO' && p.estado === 'APROBADO').length,
      socios_pendientes: profiles.filter(p => p.rol === 'SOCIO' && p.estado === 'PENDIENTE').length,
      total_comercios: profiles.filter(p => p.rol === 'COMERCIO').length,
      comercios_activos: profiles.filter(p => p.rol === 'COMERCIO' && p.estado === 'APROBADO').length
    };

    return metrics;
  },

  async getAuditoriaLogs() {
    const { data, error } = await supabase
      .from('auditoria_logs')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(100);
    if (error) throw error;
    return data;
  },

  async rejectPayment(pagoId: string, motivo: string) {
    const { data, error } = await supabase.rpc('rechazar_pago', { p_pago_id: pagoId, p_motivo: motivo });
    if (error) throw error;
    return data;
  },

  async detectMoraManual() {
    // This is logic that should definitely be in an Edge Function or RPC.
    // For now, we can only trigger it if there is a function.
    const { data, error } = await supabase.rpc('detectar_mora_manual');
    if (error) throw error;
    return data;
  },

  async resetPassword(userId: string, newPassword: string) {
    // This requires admin privileges (Service Role). 
    // In a real Supabase setup, this would be an Edge Function.
    const { data, error } = await supabase.rpc('admin_reset_password', {
      user_id: userId,
      new_password: newPassword
    });
    if (error) throw error;
    return data;
  },

  async updateUser(userId: string, updates: any) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
};
