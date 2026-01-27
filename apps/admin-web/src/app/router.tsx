// apps/admin-web/src/app/router.tsx
import { createBrowserRouter, Navigate } from "react-router-dom";

import RequireAuth from "../components/RequiereAuth";
import AdminLayout from "../layouts/AdminLayout";
import AuthLayout from "../layouts/AuthLayout";

import { getAdminOrderDetail } from "../api/adminApi";
import BackgroundChecksPage from "../pages/BackgroundChecksPage";
import CertificationsPage from "../pages/CertificationsPage";
import CustomerDetail from "../pages/CustomerDetail";
import Customers from "../pages/Customers";
import Dashboard from "../pages/Dashboard";
import Login from "../pages/Login";
import NotFound from "../pages/NotFound";
import OrderDetail from "../pages/OrderDetail";
import Orders from "../pages/Orders";
import SpecialistDetail from "../pages/SpecialistDetail";
import Specialists from "../pages/Specialists";

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
     errorElement: <NotFound />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: "customers", element: <Customers /> },
          { path: "customers/:id", element: <CustomerDetail /> },

          { path: "specialists", element: <Specialists /> },
          { path: "specialists/:id", element: <SpecialistDetail /> },

          { path: "orders", element: <Orders /> },
          {
  path: "orders/:id",
  element: <OrderDetail />,
  loader: async ({ params }) => {
    const id = String(params.id ?? "").trim();
    if (!id) throw new Response("Falta ID", { status: 400 });
    return getAdminOrderDetail(id);
  },
},
{ path: "certifications", element: <CertificationsPage /> },
  { path: "background-checks", element: <BackgroundChecksPage /> },


        ],
      },
    ],
  },

  { path: "*", element: <NotFound /> },
]);




