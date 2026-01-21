// apps/admin-web/src/app/router.tsx
import { createBrowserRouter, Navigate } from "react-router-dom";

import RequireAuth from "../components/RequireAuth";
import AdminLayout from "../layouts/AdminLayout";
import AuthLayout from "../layouts/AuthLayout";

import CustomerDetail from "../pages/CustomerDetail";
import Customers from "../pages/Customers";
import Dashboard from "../pages/Dashboard";
import Login from "../pages/Login";
import NotFound from "../pages/NotFound";
import SpecialistDetail from "../pages/SpecialistDetail"; // ✅ NUEVO
import Specialists from "../pages/Specialists"; // ✅ NUEVO


export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [
      { path: "/", element: <Navigate to="/login" replace /> },
      { path: "/login", element: <Login /> },
    ],
  },

  {
    path: "/app",
    element: <RequireAuth />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: "customers", element: <Customers /> },
          { path: "customers/:id", element: <CustomerDetail /> },

          { path: "specialists", element: <Specialists /> }, // ✅ NUEVO
          { path: "specialists/:id", element: <SpecialistDetail /> }, // ✅ NUEVO

        ],
      },
    ],
  },

  { path: "*", element: <NotFound /> },
]);




