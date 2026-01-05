import { Outlet } from "react-router-dom";

export default function AuthLayout() {
  return (
    <div style={{ padding: 24 }}>
      <h2>Auth Layout</h2>
      <Outlet />
    </div>
  );
}

