import axios, { type AxiosResponse } from "axios";

const baseURL =
  import.meta.env.VITE_API_BASE_URL ??
  import.meta.env.VITE_API_URL ??
  "http://localhost:3000";

const timeout = Number(import.meta.env.VITE_API_TIMEOUT ?? 15000);

export const api = axios.create({ baseURL, timeout });

api.interceptors.response.use(
  (res: AxiosResponse) => res,
  (err) => {
    console.error("[API]", err);
    return Promise.reject(err);
  }
);
