import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { ApiError } from '../../lib/api-types.ts';
import { currentUser, logout, type User } from '../../lib/auth.ts';
import { onUnauthorized } from '../../lib/http.ts';
import '../../components/SiteHeader.css';
import './admin.css';

// Marco del panel de administración: la misma barra institucional de la
// búsqueda pública, con la sesión del personal a la derecha. Sin sesión, o si
// vence mientras se trabaja, lleva al inicio de sesión y después vuelve aquí.
export function AdminLayout() {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    const toLogin = () => navigate('/acceso', { replace: true, state: { from: pathname } });
    onUnauthorized(toLogin);
    currentUser().then(setUser, (caught) => {
      if (caught instanceof ApiError && caught.status === 401) toLogin();
      else setError(caught instanceof ApiError ? caught.message : 'No se pudo cargar el panel.');
    });
    return () => onUnauthorized(null);
    // Solo al entrar al panel: navegar dentro de él no vuelve a pedir la sesión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    await logout().catch(() => undefined);
    navigate('/acceso', { replace: true });
  };

  return (
    <div className="admin">
      <header className="encabezado admin-encabezado">
        <Link to="/admin" className="encabezado-marca">
          BJFF Book Locator
        </Link>
        <p className="admin-seccion">Administración</p>
        <nav className="admin-sesion" aria-label="Sesión">
          <Link to="/">Búsqueda pública</Link>
          {user && <span className="admin-usuario">{user.full_name ?? user.username}</span>}
          <button type="button" className="admin-salir" onClick={() => void signOut()}>
            Cerrar sesión
          </button>
        </nav>
      </header>
      {user ? (
        <Outlet />
      ) : (
        <main className="admin-pagina">
          <p className={error ? 'admin-error' : 'admin-cargando'}>{error ?? 'Cargando…'}</p>
        </main>
      )}
    </div>
  );
}
