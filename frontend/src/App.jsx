import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useSelector } from 'react-redux';
import AppLayout from './components/layout/AppLayout';
import { PageLoader } from './components/ui';
import { canSee, NAV } from './components/layout/nav';
import Login from './pages/Login';

const pages = {
  '/pos': lazy(() => import('./pages/POS')),
  '/dashboard': lazy(() => import('./pages/Dashboard')),
  '/sales': lazy(() => import('./pages/Sales')),
  '/sales-return': lazy(() => import('./pages/SalesReturn')),
  '/purchase': lazy(() => import('./pages/Purchase')),
  '/purchase-return': lazy(() => import('./pages/PurchaseReturn')),
  '/customers': lazy(() => import('./pages/Customers')),
  '/suppliers': lazy(() => import('./pages/Suppliers')),
  '/payment': lazy(() => import('./pages/Payment')),
  '/collection': lazy(() => import('./pages/Collection')),
  '/accounts': lazy(() => import('./pages/Accounts')),
  '/profit': lazy(() => import('./pages/Profit')),
  '/reports': lazy(() => import('./pages/ReportHub')),
  '/settings': lazy(() => import('./pages/Settings')),
  '/activity': lazy(() => import('./pages/ActivityLog')),
  '/barcode': lazy(() => import('./pages/BarcodeLabels')),
  '/price-manager': lazy(() => import('./pages/PriceManager')),
  '/products': lazy(() => import('./pages/Products')),
};

function RequireAuth({ children }) {
  const token = useSelector((s) => s.auth.token);
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const role = useSelector((s) => s.auth.user?.role);
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<Navigate to="/pos" replace />} />
        {NAV.filter((n) => canSee(role, n.minRole)).map((n) => {
          const Page = pages[n.to];
          return <Route key={n.to} path={`${n.to}/*`} element={<Suspense fallback={<PageLoader />}><Page /></Suspense>} />;
        })}
        <Route path="*" element={<Navigate to="/pos" replace />} />
      </Route>
    </Routes>
  );
}
