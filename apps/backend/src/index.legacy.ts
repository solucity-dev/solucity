import cors from 'cors';
import express from 'express';
import morgan from 'morgan';

import registerRoutes from './routes/register.routes';

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/auth', registerRoutes);

// Manejo de errores simple
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  },
);

app.listen(PORT, () => {
  console.log(`API ready on http://localhost:${PORT}`);
});
