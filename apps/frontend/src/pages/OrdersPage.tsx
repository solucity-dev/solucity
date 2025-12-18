import { api } from "@/lib/api";
import { useEffect, useState } from "react";

type OrderStatus = "PENDING" | "ACCEPTED" | "CONFIRMED" | "FINISHED" | "CANCELED";

type Order = {
  id: string;
  status: OrderStatus;
  description: string | null;
  acceptDeadlineAt: string | null;
  createdAt: string;
};

type OrdersResponse = {
  ok: boolean;
  list: Order[];
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get<OrdersResponse>(
          "/orders?status=PENDING&deadline=active"
        );
        setOrders(data.list ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="p-6">Cargando órdenes…</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Órdenes</h1>
      <ul className="space-y-2">
        {orders.map((o) => (
          <li key={o.id} className="rounded border bg-white p-3">
            <div className="font-medium">{o.description ?? "(sin desc.)"}</div>
            <div className="text-sm text-zinc-600">
              Estado: {o.status} · Creada: {new Date(o.createdAt).toLocaleString()}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

