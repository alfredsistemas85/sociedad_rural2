import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface Socio {
    id: string;
    nombre_apellido: string;
    dni: string;
    email: string;
    telefono: string;
    rol: 'SOCIO' | 'ADMIN' | 'COMERCIO' | 'CAMARA';
    estado: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' | 'SUSPENDIDO' | 'RESTRINGIDO';
    motivo?: string;
    password_changed?: boolean;
    municipio?: string;
    direccion?: string;
    foto_url?: string;
    titular_id?: string | null;
    tipo_vinculo?: string | null;
}

interface AuthContextType {
    user: Socio | null;
    token: string | null;
    login: (token: string, userData: Socio) => void;
    logout: () => void;
    updateUser: (userData: Partial<Socio>) => void;
    isAuthenticated: boolean;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<Socio | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const loadProfile = async (sessionUser: any) => {
        try {
            const { data, error } = await supabase.from('profiles').select('*').eq('id', sessionUser.id).single();
            if (data && !error) {
                setUser(data as Socio);
                localStorage.setItem('socio', JSON.stringify(data));
            }
        } catch (e) {
            console.error('Error loading profile', e);
        }
    };

    const clearLocalState = () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('token');
        localStorage.removeItem('socio');
    };

    const doLogout = async () => {
        clearLocalState();
        await supabase.auth.signOut().catch(() => { });
    };

    useEffect(() => {
        // Initial session check
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                setToken(session.access_token);
                localStorage.setItem('token', session.access_token);
                loadProfile(session.user).finally(() => setIsLoading(false));
            } else {
                clearLocalState();
                setIsLoading(false);
            }
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session) {
                setToken(session.access_token);
                localStorage.setItem('token', session.access_token);
                if (!user || user.id !== session.user.id) {
                    loadProfile(session.user);
                }
            } else {
                clearLocalState();
            }
        });

        return () => subscription.unsubscribe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const login = (newToken: string, userData: Socio) => {
        setToken(newToken);
        setUser(userData);
        localStorage.setItem('token', newToken);
        localStorage.setItem('socio', JSON.stringify(userData));
    };

    const logout = () => doLogout();

    const updateUser = (userData: Partial<Socio>) => {
        setUser(prev => {
            if (!prev) return null;
            const updated = { ...prev, ...userData };
            localStorage.setItem('socio', JSON.stringify(updated));
            return updated;
        });
    };

    return (
        <AuthContext.Provider value={{
            user,
            token,
            login,
            logout,
            updateUser,
            isAuthenticated: !!token && !!user,
            isLoading
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
