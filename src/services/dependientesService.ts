import { supabase } from '../lib/supabaseClient';

export interface Dependiente {
    id: string;
    nombre_apellido: string;
    dni: string; // The database field is dni, even if the frontend form says dni_cuit
    tipo_vinculo: string;
    telefono?: string;
    email?: string;
}

export const dependientesService = {
    async getMisDependientes(titular_id: string) {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('titular_id', titular_id)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data;
    },

    async agregarDependiente(titular_id: string, titular_rol: string, data: Partial<Dependiente>) {
        // En supabase lo manejamos creando un profile vinculado.
        // Asignamos rol basado en si el titular es comercio o socio.
        const rol = titular_rol === 'COMERCIO' ? 'COMERCIO' : 'SOCIO';
        const password_generada = data.dni;

        // Idealmente esto debería pasar por Auth (signUp), pero para dependientes que quizás no entran al panel:
        // Supabase Auth requiere email. Si no hay email, capaz no pueden loguearse.
        // Asumimos que la lógica backend permitía crear un profile para un dependiente con o sin login usando edge functions o admin API.
        // Si no tenemos auth admin API en el cliente, tenemos que hacer esto como insert simple a 'profiles'.
        // Nota: para evitar problemas de RLS, esto podría necesitar una Edge Function o rls policy específica.
        // Asumiremos que el usuario puede insertar perfiles con titular_id igual a su propio id.

        const newProfile = {
            nombre_apellido: data.nombre_apellido,
            dni: data.dni,
            email: data.email || null,
            telefono: data.telefono || null,
            rol: rol,
            tipo_vinculo: data.tipo_vinculo,
            titular_id: titular_id,
            estado: 'APROBADO', // Dependientes nacen aprobados si el titular los crea
        };

        const { data: inserted, error } = await supabase
            .from('profiles')
            .insert(newProfile)
            .select()
            .single();

        if (error) throw error;

        // Insert we also log
        await supabase.from('activity_log').insert({
            socio_id: titular_id,
            tipo_evento: 'VINCULACION_CREADA',
            descripcion: `Agregó a ${data.nombre_apellido} como ${data.tipo_vinculo}`,
            usuario_id: titular_id
        });

        return inserted;
    },

    async eliminarDependiente(id: string, titular_id: string) {
        // Obtenemos nombre para el log
        const { data: dep } = await supabase.from('profiles').select('nombre_apellido, tipo_vinculo').eq('id', id).single();

        const { error } = await supabase
            .from('profiles')
            .delete()
            .eq('id', id)
            .eq('titular_id', titular_id); // Security: solo puede borrar si es titular
        
        if (error) throw error;

        if (dep) {
            await supabase.from('activity_log').insert({
                socio_id: titular_id,
                tipo_evento: 'VINCULACION_ELIMINADA',
                descripcion: `Eliminó a ${dep.nombre_apellido} (${dep.tipo_vinculo})`,
                usuario_id: titular_id
            });
        }
        
        return true;
    }
};
