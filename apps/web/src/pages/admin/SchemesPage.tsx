import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { formatDate, statusText } from '../../lib/admin-format.ts';
import type { SchemeRow } from '../../lib/admin-types.ts';
import { copyScheme, createScheme, listSchemes } from '../../lib/mock-admin.ts';

// Lista de esquemas: el punto de entrada del panel.
export function SchemesPage() {
  const [schemes, setSchemes] = useState<SchemeRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    void listSchemes().then(setSchemes);
  }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    const scheme = await createScheme(name.trim());
    navigate(`/admin/esquemas/${scheme.scheme_id}`);
  };

  const copy = async (schemeId: number) => {
    const scheme = await copyScheme(schemeId);
    navigate(`/admin/esquemas/${scheme.scheme_id}`);
  };

  return (
    <main className="admin-pagina">
      <div className="admin-cabecera">
        <h1 className="titulo admin-titulo">Esquemas</h1>
        {!creating && (
          <button type="button" className="boton-principal" onClick={() => setCreating(true)}>
            Nuevo esquema
          </button>
        )}
      </div>

      {creating && (
        <form className="admin-nuevo" onSubmit={create}>
          <label htmlFor="nombre-esquema">Nombre del esquema</label>
          <div className="admin-nuevo-fila">
            <input
              id="nombre-esquema"
              className="campo"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              autoFocus
            />
            <button type="submit" className="boton-principal" disabled={!name.trim()}>
              Crear
            </button>
            <button type="button" className="boton-secundario" onClick={() => setCreating(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {schemes === null ? (
        <p className="admin-cargando">Cargando esquemas…</p>
      ) : (
        <table className="tabla-esquemas">
          <thead>
            <tr>
              <th scope="col">Esquema</th>
              <th scope="col">Estado</th>
              <th scope="col">Plano</th>
              <th scope="col">Modificado</th>
              <th scope="col">
                <span className="visualmente-oculto">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {schemes.map((scheme) => (
              <tr key={scheme.scheme_id} className={scheme.is_active ? 'esquema-en-uso' : undefined}>
                <td>
                  <Link to={`/admin/esquemas/${scheme.scheme_id}`} className="esquema-nombre">
                    {scheme.name}
                  </Link>
                  {scheme.short_description && <span className="esquema-descripcion">{scheme.short_description}</span>}
                </td>
                <td className="esquema-estado">{statusText(scheme)}</td>
                <td>{scheme.has_map ? 'Sí' : 'No'}</td>
                <td className="esquema-fecha">{formatDate(scheme.updated_at)}</td>
                <td className="esquema-acciones">
                  <button type="button" className="boton-texto" onClick={() => void copy(scheme.scheme_id)}>
                    Copiar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

