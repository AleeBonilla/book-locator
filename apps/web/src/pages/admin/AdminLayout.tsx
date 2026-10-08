import { Link, Outlet } from 'react-router';
import '../../components/SiteHeader.css';
import './admin.css';

// Marco del panel de administración: la misma barra institucional de la
// búsqueda pública, con la sesión del personal a la derecha.
export function AdminLayout() {
  return (
    <div className="admin">
      <header className="encabezado admin-encabezado">
        <Link to="/admin" className="encabezado-marca">
          BJFF Book Locator
        </Link>
        <p className="admin-seccion">Administración</p>
        <nav className="admin-sesion" aria-label="Sesión">
          <Link to="/">Búsqueda pública</Link>
          <span className="admin-usuario">Ana Pérez</span>
          <Link to="/acceso">Cerrar sesión</Link>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
