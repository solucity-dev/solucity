//apps/admin-web/src/pages/InquiriesPage.tsx
import React from "react";
import {
  getAdminInquiries,
  getAdminInquiryDetail,
  type AdminInquiryDetail,
  type AdminInquiryRow,
} from "../api/adminApi";

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-AR");
}

function InquiryDetailCard({
  inquiry,
  loading,
  error,
  onClose,
}: {
  inquiry: AdminInquiryDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        marginTop: 20,
        background: "#fff",
        borderRadius: 16,
        border: "1px solid #e5e7eb",
        boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "16px 18px",
          borderBottom: "1px solid #eef2f7",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Detalle de consulta</h3>
          <div style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>
            Conversación previa a la contratación
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            border: "none",
            background: "#111827",
            color: "#fff",
            borderRadius: 10,
            padding: "10px 14px",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Cerrar
        </button>
      </div>

      <div style={{ padding: 18 }}>
        {loading && <div>Cargando detalle…</div>}

        {!loading && error && (
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              background: "#fef2f2",
              color: "#991b1b",
              border: "1px solid #fecaca",
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && inquiry && (
          <div style={{ display: "grid", gap: 18 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <div
                style={{
                  background: "#f8fafc",
                  borderRadius: 12,
                  padding: 12,
                  border: "1px solid #e5e7eb",
                }}
              >
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Creada</div>
                <div style={{ fontWeight: 700 }}>{formatDate(inquiry.createdAt)}</div>
              </div>

              <div
                style={{
                  background: "#f8fafc",
                  borderRadius: 12,
                  padding: 12,
                  border: "1px solid #e5e7eb",
                }}
              >
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Categoría</div>
                <div style={{ fontWeight: 700 }}>{inquiry.categorySlug || "—"}</div>
              </div>

              <div
                style={{
                  background: "#f8fafc",
                  borderRadius: 12,
                  padding: 12,
                  border: "1px solid #e5e7eb",
                }}
              >
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Mensajes</div>
                <div style={{ fontWeight: 700 }}>{inquiry.messagesCount}</div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 12,
              }}
            >
              <div
                style={{
                  background: "#ffffff",
                  borderRadius: 12,
                  padding: 14,
                  border: "1px solid #e5e7eb",
                }}
              >
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>Cliente</div>
                <div style={{ fontWeight: 800 }}>{inquiry.customer?.name || "—"}</div>
                <div style={{ color: "#4b5563", marginTop: 4 }}>{inquiry.customer?.email || "—"}</div>
              </div>

              <div
                style={{
                  background: "#ffffff",
                  borderRadius: 12,
                  padding: 14,
                  border: "1px solid #e5e7eb",
                }}
              >
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>Especialista</div>
                <div style={{ fontWeight: 800 }}>
                  {inquiry.specialist?.businessName || inquiry.specialist?.name || "—"}
                </div>
                <div style={{ color: "#4b5563", marginTop: 4 }}>{inquiry.specialist?.email || "—"}</div>
              </div>
            </div>

            <div>
              <h4 style={{ margin: "0 0 10px 0", fontSize: 16 }}>Mensajes</h4>

              {inquiry.messages.length === 0 ? (
                <div
                  style={{
                    background: "#f8fafc",
                    borderRadius: 12,
                    padding: 14,
                    border: "1px solid #e5e7eb",
                    color: "#6b7280",
                  }}
                >
                  Esta consulta todavía no tiene mensajes.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {inquiry.messages.map((msg: AdminInquiryDetail["messages"][number]) => (
                    <div
                      key={msg.id}
                      style={{
                        background: "#f8fafc",
                        borderRadius: 12,
                        padding: 12,
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          flexWrap: "wrap",
                          marginBottom: 6,
                        }}
                      >
                        <strong>{msg.sender?.name || "Usuario"}</strong>
                        <span style={{ color: "#6b7280", fontSize: 13 }}>
                          {formatDate(msg.createdAt)}
                        </span>
                      </div>

                      <div style={{ color: "#111827", whiteSpace: "pre-wrap" }}>{msg.body}</div>

                      {msg.readAt ? (
                        <div style={{ color: "#6b7280", fontSize: 12, marginTop: 8 }}>
                          Leído: {formatDate(msg.readAt)}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InquiriesPage() {
  const [q, setQ] = React.useState("");
  const [search, setSearch] = React.useState("");

  const [items, setItems] = React.useState<AdminInquiryRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<AdminInquiryDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getAdminInquiries({ q: search || undefined });
      setItems(Array.isArray(res.items) ? res.items : []);
    } catch (e: any) {
      setError(e?.message || "No se pudieron cargar las consultas.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  React.useEffect(() => {
    load();
  }, [load]);

  const openDetail = React.useCallback(async (id: string) => {
    try {
      setSelectedId(id);
      setDetailLoading(true);
      setDetailError(null);
      const res = await getAdminInquiryDetail(id);
      setDetail(res.inquiry);
    } catch (e: any) {
      setDetail(null);
      setDetailError(e?.message || "No se pudo cargar el detalle de la consulta.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>Consultas</h1>
          <p style={{ margin: "8px 0 0 0", color: "#6b7280" }}>
            Consultas previas entre clientes y especialistas.
          </p>
        </div>

        <button
          onClick={load}
          disabled={loading}
          style={{
            border: "none",
            background: "#0f766e",
            color: "#fff",
            borderRadius: 10,
            padding: "10px 14px",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          {loading ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #e5e7eb",
          boxShadow: "0 10px 25px rgba(0,0,0,0.05)",
          padding: 16,
          marginBottom: 18,
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(q.trim());
          }}
          style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por cliente, especialista, email, categoría o ID"
            style={{
              flex: 1,
              minWidth: 280,
              border: "1px solid #d1d5db",
              borderRadius: 10,
              padding: "12px 14px",
              fontSize: 14,
            }}
          />

          <button
            type="submit"
            style={{
              border: "none",
              background: "#111827",
              color: "#fff",
              borderRadius: 10,
              padding: "12px 16px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Buscar
          </button>

          <button
            type="button"
            onClick={() => {
              setQ("");
              setSearch("");
            }}
            style={{
              border: "1px solid #d1d5db",
              background: "#fff",
              color: "#111827",
              borderRadius: 10,
              padding: "12px 16px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Limpiar
          </button>
        </form>
      </div>

      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #e5e7eb",
          boxShadow: "0 10px 25px rgba(0,0,0,0.05)",
          overflow: "hidden",
        }}
      >
        {loading ? (
          <div style={{ padding: 20 }}>Cargando consultas…</div>
        ) : error ? (
          <div style={{ padding: 20, color: "#991b1b" }}>{error}</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 20, color: "#6b7280" }}>No hay consultas para mostrar.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                  <th style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}>Fecha</th>
                  <th style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}>Cliente</th>
                  <th style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}>Especialista</th>
                  <th style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}>Categoría</th>
                  <th style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}>Mensajes</th>
                  <th style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}>Último mensaje</th>
                  <th style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td style={{ padding: 14, borderBottom: "1px solid #f1f5f9" }}>
                      {formatDate(item.createdAt)}
                    </td>

                    <td style={{ padding: 14, borderBottom: "1px solid #f1f5f9" }}>
                      <div style={{ fontWeight: 700 }}>{item.customer?.name || "—"}</div>
                      <div style={{ color: "#6b7280", fontSize: 13 }}>{item.customer?.email || "—"}</div>
                    </td>

                    <td style={{ padding: 14, borderBottom: "1px solid #f1f5f9" }}>
                      <div style={{ fontWeight: 700 }}>
                        {item.specialist?.businessName || item.specialist?.name || "—"}
                      </div>
                      <div style={{ color: "#6b7280", fontSize: 13 }}>
                        {item.specialist?.email || "—"}
                      </div>
                    </td>

                    <td style={{ padding: 14, borderBottom: "1px solid #f1f5f9" }}>
                      {item.categorySlug || "—"}
                    </td>

                    <td style={{ padding: 14, borderBottom: "1px solid #f1f5f9" }}>
                      {item.messagesCount}
                    </td>

                    <td style={{ padding: 14, borderBottom: "1px solid #f1f5f9", maxWidth: 320 }}>
                      {item.lastMessage ? (
                        <div>
                          <div style={{ fontWeight: 700, marginBottom: 4 }}>
                            {item.lastMessage.senderName || "Usuario"}
                          </div>
                          <div
                            style={{
                              color: "#4b5563",
                              fontSize: 13,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={item.lastMessage.body}
                          >
                            {item.lastMessage.body}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: "#6b7280" }}>Sin mensajes</span>
                      )}
                    </td>

                    <td style={{ padding: 14, borderBottom: "1px solid #f1f5f9" }}>
                      <button
                        onClick={() => openDetail(item.id)}
                        style={{
                          border: "none",
                          background: selectedId === item.id ? "#0f766e" : "#111827",
                          color: "#fff",
                          borderRadius: 10,
                          padding: "10px 12px",
                          cursor: "pointer",
                          fontWeight: 700,
                        }}
                      >
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedId && (
        <InquiryDetailCard
          inquiry={detail}
          loading={detailLoading}
          error={detailError}
          onClose={() => {
            setSelectedId(null);
            setDetail(null);
            setDetailError(null);
          }}
        />
      )}
    </div>
  );
}
