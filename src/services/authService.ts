import { supabase } from '../lib/supabaseClient';

export const authService = {
  async login(emailOrDni: string, password: string) {
    let loginEmail = emailOrDni;

    // Check if input is DNI (numeric)
    if (/^\d+$/.test(emailOrDni)) {
      // Find email for this DNI
      const { data, error } = await supabase
        .from('profiles')
        .select('email')
        .eq('dni', emailOrDni.trim())
        .single();

      if (error || !data) {
        throw new Error('No se encontró una cuenta con ese DNI.');
      }
      loginEmail = data.email;
    }

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password,
    });

    if (authError) throw new Error(authError.message);
    if (!authData.user) throw new Error('Error al iniciar sesión');

    // Fetch user profile
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError) throw new Error(profileError.message);

    // Check status
    if (profileData.estado !== 'APROBADO' && profileData.estado !== 'RESTRINGIDO') {
      await supabase.auth.signOut();
      throw new Error(`Su usuario se encuentra ${profileData.estado}. Contacte a la Administración.`);
    }

    // Check if needs password change
    const defaultPasswords = ["comercio1234", "socio1234", "socio123", "SRNC2026!", "camara1234"];
    const necesita_cambio_password = defaultPasswords.includes(password) || profileData.password_changed === false;

    return {
      message: 'Login exitoso',
      tipo_identificacion_detectado: /^\d+$/.test(emailOrDni) ? 'dni' : 'email',
      necesita_cambio_password,
      socio: profileData,
      session: authData.session
    };
  },

  async register(userData: any) {
    const rol_asignado = userData.rol ? userData.rol.toUpperCase() : 'SOCIO';
    const user_password = userData.password || 'socio1234';
    const defaultPasswords = ["comercio1234", "socio1234", "socio123", "SRNC2026!", "camara1234"];
    const password_changed = !!userData.password && !defaultPasswords.includes(userData.password) && userData.password.length >= 8;

    // 1. Sign up user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: userData.email.trim(),
      password: user_password,
    });

    if (authError) throw new Error(authError.message);
    if (!authData.user) throw new Error('Error en el registro');

    const userId = authData.user.id;

    // 2. Insert into profiles
    const profile_data = {
      id: userId,
      nombre_apellido: userData.nombre_apellido,
      dni: userData.dni_cuit,
      email: userData.email,
      telefono: userData.telefono,
      rol: rol_asignado,
      estado: 'PENDIENTE',
      municipio: userData.municipio || null,
      direccion: userData.direccion || null,
      rubro: userData.rubro || null,
      es_profesional: userData.es_profesional || false,
      password_changed: password_changed,
    };

    const { error: profileError } = await supabase.from('profiles').insert(profile_data);

    if (profileError) {
      // Cleanup? Usually better to do this in an Edge Function for atomicity, but doing it here as best-effort for now.
      throw new Error('Error guardando el perfil: ' + profileError.message);
    }

    // 3. Insert into specific role tables if needed
    if (rol_asignado === 'COMERCIO') {
      await supabase.from('comercios').insert({
        id: userId,
        nombre_comercio: userData.nombre_apellido,
        cuit: userData.dni_cuit,
        rubro: userData.rubro,
        direccion: userData.direccion
      });
    } else if (rol_asignado === 'CAMARA') {
      await supabase.from('camaras').insert({
        id: userId,
        denominacion: userData.nombre_apellido,
        cuit: userData.dni_cuit,
        municipio: userData.municipio || '',
        provincia: userData.direccion || '',
        responsable_nombre: userData.rubro || '',
        email: userData.email,
        telefono: userData.telefono
      });
    }

    return {
      message: `${rol_asignado.charAt(0).toUpperCase() + rol_asignado.slice(1).toLowerCase()} registrado correctamente. Pendiente de aprobación por Admin.`,
      socio: profile_data
    };
  },

  async logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  },

  async resetPasswordRequest(identificador: string) {
    // Simplified for now - usually calls backend, but we can insert into notificaciones_admin
    let userId = null;
    let email = null;
    let name = null;

    const { data } = await supabase.from('profiles').select('id, email, nombre_apellido').or(`email.eq.${identificador},dni.eq.${identificador}`).maybeSingle();
    if (data) {
      userId = data.id;
      email = data.email;
      name = data.nombre_apellido;

      await supabase.from('notificaciones_admin').insert({
        usuario_id: userId,
        tipo: "OLVIDO_PASSWORD",
        descripcion: `El usuario ${name} (${email}) solicita restablecer su contraseña.`,
        estado: "PENDIENTE"
      });
    }
    return { message: "Si el usuario existe, el administrador ha sido notificado." };
  },

  async changePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ password_changed: true }).eq('id', user.id);
    }
  }
};
