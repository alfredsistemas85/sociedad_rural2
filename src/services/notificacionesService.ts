import { supabase } from '../lib/supabaseClient';

export interface Notification {
    id: string;
    titulo: string;
    mensaje: string;
    leido: boolean;
    link_url?: string;
    created_at: string;
}

export const notificacionesService = {
    async getMyNotifications(user_id: string) {
        const { data, error } = await supabase
            .from('notificaciones')
            .select('*')
            .eq('usuario_id', user_id)
            .order('created_at', { ascending: false })
            .limit(50);
        
        if (error) throw error;

        const notificaciones = data || [];
        const no_leidas = notificaciones.filter((n: any) => !n.leido).length;

        return { notificaciones, no_leidas };
    },

    async markAllAsRead(user_id: string) {
        const { error } = await supabase
            .from('notificaciones')
            .update({ leido: true })
            .eq('usuario_id', user_id)
            .eq('leido', false);
        
        if (error) throw error;
        return true;
    },

    async registerPushToken(user_id: string, token: string, plataforma: string = 'web') {
        const { error } = await supabase
            .from('push_tokens')
            .upsert({
                usuario_id: user_id,
                token: token,
                plataforma: plataforma,
                updated_at: new Date().toISOString()
            }, { onConflict: 'token' });
            
        if (error) throw error;
        return true;
    }
};
