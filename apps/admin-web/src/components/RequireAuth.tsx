// apps/admin-web/src/components/RequiereAuth.tsx
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isAuthed } from "../auth/auth";

export default function RequireAuth() {
  const location = useLocation();

  if (!isAuthed()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

