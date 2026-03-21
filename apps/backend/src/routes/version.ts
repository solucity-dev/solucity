import { Router, type Request, type Response } from 'express';

const router = Router();

/**
 * GET /version
 * Devuelve la política de versión mínima / última recomendada para mobile.
 *
 * Env vars opcionales:
 * - MOBILE_MIN_VERSION_CODE
 * - MOBILE_LATEST_VERSION_CODE
 * - MOBILE_FORCE_UPDATE
 * - MOBILE_UPDATE_TITLE
 * - MOBILE_UPDATE_MESSAGE
 * - MOBILE_STORE_URL
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const minVersionCode = Number(process.env.MOBILE_MIN_VERSION_CODE ?? 44);
    const latestVersionCode = Number(process.env.MOBILE_LATEST_VERSION_CODE ?? 44);

    const forceUpdate =
      String(process.env.MOBILE_FORCE_UPDATE ?? 'false')
        .trim()
        .toLowerCase() === 'true';

    const title = process.env.MOBILE_UPDATE_TITLE?.trim() || 'Nueva actualización disponible';

    const message =
      process.env.MOBILE_UPDATE_MESSAGE?.trim() ||
      'Actualizá Solucity para seguir usando la app con la última versión disponible.';

    const storeUrl =
      process.env.MOBILE_STORE_URL?.trim() ||
      'https://play.google.com/store/apps/details?id=com.solucity.app';

    return res.json({
      ok: true,
      minVersionCode: Number.isFinite(minVersionCode) ? minVersionCode : 44,
      latestVersionCode: Number.isFinite(latestVersionCode) ? latestVersionCode : 44,
      forceUpdate,
      title,
      message,
      storeUrl,
    });
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('GET /version', e);
    }
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export const versionRouter = router;
export default router;
