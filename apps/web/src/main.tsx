import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { LoginPage } from './pages/LoginPage.tsx';
import { SearchPage } from './pages/SearchPage.tsx';
import './index.css';

const router = createBrowserRouter([
  { path: '/', element: <SearchPage /> },
  { path: '/acceso', element: <LoginPage /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
