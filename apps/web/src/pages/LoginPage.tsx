import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import edificio from '../assets/bjff-edificio.webp';
import { ApiError } from '../lib/api-types.ts';
import { login } from '../lib/auth.ts';
import './LoginPage.css';

type Status = 'idle' | 'loading' | 'rejected' | 'failed';

export function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [failure, setFailure] = useState('');
  const navigate = useNavigate();
  // Si se llegó aquí desde una página del panel sin sesión, se vuelve a ella.
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/admin';

  const missingIdentifier = touched && !identifier.trim();
  const missingPassword = touched && !password;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!identifier.trim() || !password) return;
    setStatus('loading');
    try {
      await login(identifier.trim(), password);
      navigate(from, { replace: true });
    } catch (caught) {
      // 401: la API no dice si falló el usuario o la contraseña, a propósito.
      if (caught instanceof ApiError && caught.status === 401) {
        setStatus('rejected');
      } else {
        setFailure(caught instanceof ApiError ? caught.message : 'No se pudo iniciar sesión.');
        setStatus('failed');
      }
    }
  };

  return (
    <main className="acceso">
      <div className="acceso-tarjeta">
        <div className="acceso-foto">
          <img src={edificio} alt="Edificio de la Biblioteca José Figueres Ferrer" width={780} height={498} />
          <p className="acceso-etiqueta">Acceso del personal</p>
        </div>

        <div className="acceso-cuerpo">
          <p className="acceso-institucion">
            <span>Biblioteca José Figueres Ferrer</span>
            <span>Tecnológico de Costa Rica</span>
          </p>
          <h1 className="titulo acceso-titulo">Iniciar sesión</h1>

            <form className="acceso-formulario" onSubmit={submit} noValidate>
              {status === 'rejected' && (
                <p className="acceso-rechazo" role="alert">
                  El usuario o la contraseña no son correctos.
                </p>
              )}
              {status === 'failed' && (
                <p className="acceso-rechazo" role="alert">
                  {failure}
                </p>
              )}

              <div className="acceso-campo">
                <label htmlFor="identificador">Usuario o correo</label>
                <div className={missingIdentifier ? 'acceso-control con-error' : 'acceso-control'}>
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <circle cx="10" cy="7" r="3.5" />
                    <path d="M3.5 17c.8-3.3 3.4-5 6.5-5s5.7 1.7 6.5 5" />
                  </svg>
                  <input
                    id="identificador"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    autoComplete="username"
                    autoCapitalize="off"
                    spellCheck={false}
                    aria-invalid={missingIdentifier}
                    aria-describedby={missingIdentifier ? 'identificador-error' : undefined}
                  />
                </div>
                {missingIdentifier && (
                  <p id="identificador-error" className="acceso-error">
                    Escriba su usuario o correo.
                  </p>
                )}
              </div>

              <div className="acceso-campo">
                <label htmlFor="contrasena">Contraseña</label>
                <div className={missingPassword ? 'acceso-control con-error' : 'acceso-control'}>
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <rect x="4" y="9" width="12" height="8.5" rx="1" />
                    <path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" />
                  </svg>
                  <input
                    id="contrasena"
                    type={visible ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    aria-invalid={missingPassword}
                    aria-describedby={missingPassword ? 'contrasena-error' : undefined}
                  />
                  <button
                    type="button"
                    className="acceso-mostrar"
                    aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    aria-pressed={visible}
                    onClick={() => setVisible((value) => !value)}
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" />
                      <circle cx="10" cy="10" r="2.5" />
                      {visible && <path d="M3.5 3.5l13 13" />}
                    </svg>
                  </button>
                </div>
                {missingPassword && (
                  <p id="contrasena-error" className="acceso-error">
                    Escriba su contraseña.
                  </p>
                )}
              </div>

              <button type="submit" className="acceso-enviar" disabled={status === 'loading'}>
                {status === 'loading' ? 'Iniciando sesión…' : 'Iniciar sesión'}
              </button>
            </form>

          <Link to="/" className="acceso-volver">
            Volver a la búsqueda
          </Link>
        </div>
      </div>
    </main>
  );
}
