// apps/admin-web/src/layouts/AdminLayout.tsx
import { Outlet, useNavigate } from "react-router-dom";
import { clearToken } from "../auth/auth";

export default function AdminLayout() {
  const navigate = useNavigate();

  const handleLogout = () => {
    clearToken();
    navigate("/login", { replace: true });
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Admin Layout</h2>
        <button onClick={handleLogout}>Salir</button>
      </div>

      <div style={{ marginTop: 24 }}>
        <Outlet />
      </div>
    </div>
  );
}


