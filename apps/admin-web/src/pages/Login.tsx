import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { setToken } from "../auth/auth";
import { loginAdmin } from "../auth/authApi";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: Location })?.from?.pathname ?? "/app";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await loginAdmin({ email, password });
      setToken(res.token);
      navigate(from, { replace: true });
    } catch {
      setError("Credenciales inválidas");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="authShell">
      <div className="card">
        <div className="brand">
          <div className="brandBadge" />
          <div>
            <h1 className="h1">Solucity Admin</h1>
            <p className="p">Ingresá con tu usuario y contraseña</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <div className="label">Email</div>
            <input
              className="input"
              type="email"
              placeholder="admin@solucity.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="field">
            <div className="label">Contraseña</div>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <div className="actions">
            <button className="btn btnPrimary" type="submit" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </div>

          {error && <div className="error">{error}</div>}
        </form>
      </div>
    </div>
  );
}








