import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { LoginPage } from './pages/LoginPage.tsx';
import { AdminLayout } from './pages/admin/AdminLayout.tsx';
import { SchemePage } from './pages/admin/SchemePage.tsx';
import { SchemesPage } from './pages/admin/SchemesPage.tsx';
import { SearchPage } from './pages/SearchPage.tsx';
import './index.css';

const router = createBrowserRouter([
  { path: '/', element: <SearchPage /> },
  { path: '/acceso', element: <LoginPage /> },
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <SchemesPage /> },
      { path: 'esquemas/:schemeId', element: <SchemePage /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
