//app/admin-web/src/layouts/AuthLayout.tsx
import { Navigate, Outlet } from "react-router-dom";
import { isAuthed } from "../auth/auth";

export default function AuthLayout() {
  if (isAuthed()) return <Navigate to="/app" replace />;
  return (
    <div style={{ padding: 24 }}>
      <Outlet />
    </div>
  );
}


