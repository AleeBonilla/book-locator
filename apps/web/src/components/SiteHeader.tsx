import { Link } from 'react-router';
import './SiteHeader.css';

export function SiteHeader() {
  return (
    <header className="encabezado">
      <Link to="/" className="encabezado-marca">
        BJFF Book Locator
      </Link>
      <p className="encabezado-institucion">
        <span>Biblioteca José Figueres Ferrer</span>
        <span>Tecnológico de Costa Rica</span>
      </p>
      <Link to="/acceso" className="encabezado-acceso">
        Acceso del personal
      </Link>
    </header>
  );
}
