import { supabase } from '../lib/supabaseClient';

export interface PagoCuota {
  id: string;
  socio_id: string;
  monto: number;
  fecha_vencimiento: string;
  estado_pago: 'PENDIENTE' | 'PENDIENTE_VALIDACION' | 'PAGADO' | 'RECHAZADO';
  comprobante_url?: string;
  fecha_envio_comprobante?: string;
}

export const paymentsService = {
  async getMyPayments(socio_id: string) {
    const { data, error } = await supabase
      .from('pagos_cuotas')
      .select('*')
      .eq('socio_id', socio_id)
      .order('fecha_vencimiento', { ascending: false });
    if (error) throw error;
    return data;
  },

  async uploadComprobante(mes: number, anio: number, socio_id: string, file: File) {
    const fileExt = file.name.split('.').pop();
    const filename = `${socio_id}/${anio}_${mes}_${crypto.randomUUID()}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from('comprobantes-pagos')
      .upload(filename, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('comprobantes-pagos')
      .getPublicUrl(filename);
    
    // Check if pago exists
    const fechaVenci = `${anio}-${mes.toString().padStart(2, '0')}-10`;
    const { data: exist } = await supabase
      .from('pagos_cuotas')
      .select('id')
      .eq('socio_id', socio_id)
      .eq('fecha_vencimiento', fechaVenci)
      .maybeSingle();

    const pagoData = {
      socio_id,
      estado_pago: 'PENDIENTE_VALIDACION',
      comprobante_url: publicUrl,
      fecha_envio_comprobante: new Date().toISOString()
    };

    let resultId;
    if (exist) {
      const { data, error } = await supabase.from('pagos_cuotas').update(pagoData).eq('id', exist.id).select().single();
      if (error) throw error;
      resultId = data.id;
    } else {
      const { data, error } = await supabase.from('pagos_cuotas').insert({ ...pagoData, monto: 0, fecha_vencimiento: fechaVenci }).select().single();
      if (error) throw error;
      resultId = data.id;
    }

    // Insert activity log
    await supabase.from('activity_log').insert({
      socio_id,
      tipo_evento: 'COMPROBANTE_SUBIDO',
      descripcion: `El socio subió comprobante para la cuota ${mes}/${anio}`,
      usuario_id: socio_id
    });

    return resultId;
  },

  async getPendingPayments() {
    const { data, error } = await supabase
      .from('pagos_cuotas')
      .select('*, profiles!socio_id(nombre_apellido, dni, email)')
      .eq('estado_pago', 'PENDIENTE_VALIDACION')
      .order('fecha_envio_comprobante', { ascending: true });
    
    if (error) throw error;
    return data;
  },

  async approvePayment(pago_id: string, admin_id: string) {
    // We would ideally wrap this in an RPC or Edge Function for transaction safety.
    const { data: pago, error: pErr } = await supabase.from('pagos_cuotas').select('socio_id').eq('id', pago_id).single();
    if (pErr) throw pErr;
    
    const { error: upErr } = await supabase.from('pagos_cuotas').update({
      estado_pago: 'PAGADO',
      fecha_validacion: new Date().toISOString(),
      admin_validador_id: admin_id
    }).eq('id', pago_id);
    if (upErr) throw upErr;

    const { error: profErr } = await supabase.from('profiles').update({ estado: 'APROBADO', motivo: null }).eq('id', pago.socio_id);
    if (profErr) throw profErr;

    await supabase.from('activity_log').insert({
      socio_id: pago.socio_id,
      tipo_evento: 'PAGO_APROBADO',
      descripcion: 'Pago validado por Administración. Socio reactivado.',
      usuario_id: admin_id
    });

    return true;
  },

  async rejectPayment(pago_id: string, motivo: string, admin_id: string) {
    const { data: pago, error: pErr } = await supabase.from('pagos_cuotas').select('socio_id').eq('id', pago_id).single();
    if (pErr) throw pErr;

    const { error: upErr } = await supabase.from('pagos_cuotas').update({ estado_pago: 'RECHAZADO' }).eq('id', pago_id);
    if (upErr) throw upErr;

    await supabase.from('activity_log').insert({
      socio_id: pago.socio_id,
      tipo_evento: 'PAGO_RECHAZADO',
      descripcion: `Comprobante rechazado: ${motivo}`,
      usuario_id: admin_id
    });

    return true;
  }
};
