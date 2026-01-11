//apps/admin-web/src/auth/authApi.ts
import { apiFetch } from "../lib/api";

export type LoginRequest = {
  email: string;
  password: string;
};

export type LoginResponse = {
  token: string;
};

export async function loginAdmin(body: LoginRequest) {
  return apiFetch<LoginResponse>("/admin/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

