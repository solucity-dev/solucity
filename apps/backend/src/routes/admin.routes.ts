import { Router } from "express";
import { prisma } from "../lib/prisma";
import { auth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/requireAdmin";

const adminRouter = Router();

// 🔐 Todo lo admin requiere auth + admin
adminRouter.use(auth, requireAdmin);

/**
 * GET /admin/metrics
 */
adminRouter.get("/metrics", async (_req, res) => {
  const [
    specialistsTotal,
    subsByStatus,
    kycPending,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "SPECIALIST" } }),
    prisma.subscription.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.kycSubmission.count({ where: { status: "PENDING" } }),
  ]);

  const subs = Object.fromEntries(
    subsByStatus.map((x) => [x.status, x._count._all])
  );

  res.json({
    specialistsTotal,
    subscriptions: {
      TRIALING: subs.TRIALING ?? 0,
      ACTIVE: subs.ACTIVE ?? 0,
      PAST_DUE: subs.PAST_DUE ?? 0,
      CANCELLED: subs.CANCELLED ?? 0,
    },
    kycPending,
  });
});

/**
 * GET /admin/specialists
 */
adminRouter.get("/specialists", async (_req, res) => {
  const now = new Date();

  const users = await prisma.user.findMany({
    where: { role: "SPECIALIST" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      surname: true,
      status: true,
      createdAt: true,
      specialist: {
        select: {
          id: true,
          kycStatus: true,
          badge: true,
          ratingAvg: true,
          ratingCount: true,
          avatarUrl: true,
          subscription: {
            select: {
              status: true,
              currentPeriodEnd: true,
              currentPeriodStart: true,
              trialEnd: true,
            },
          },
        },
      },
    },
  });

  const result = users.map((u) => {
    const sub = u.specialist?.subscription;
    const end = sub?.trialEnd ?? sub?.currentPeriodEnd ?? null;

    const daysLeft =
      end
        ? Math.max(
            0,
            Math.ceil(
              (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
            )
          )
        : null;

    return {
      userId: u.id,
      specialistId: u.specialist?.id,
      email: u.email,
      name: `${u.name ?? ""} ${u.surname ?? ""}`.trim(),
      status: u.status,
      createdAt: u.createdAt,
      kycStatus: u.specialist?.kycStatus ?? "UNVERIFIED",
      badge: u.specialist?.badge ?? "BRONZE",
      ratingAvg: u.specialist?.ratingAvg ?? 0,
      ratingCount: u.specialist?.ratingCount ?? 0,
      avatarUrl: u.specialist?.avatarUrl ?? null,
      subscription: sub
        ? {
            status: sub.status,
            trialEnd: sub.trialEnd,
            currentPeriodEnd: sub.currentPeriodEnd,
          }
        : null,
      daysLeft,
    };
  });

  res.json(result);
});

/**
 * PATCH /admin/specialists/:specialistId/grant-days
 */
adminRouter.patch(
  "/specialists/:specialistId/grant-days",
  async (req, res) => {
    const { specialistId } = req.params;
    const days = Number(req.body?.days ?? 0);

    if (!Number.isFinite(days) || days <= 0 || days > 365) {
      return res.status(400).json({ message: "days inválido (1..365)" });
    }

    const spec = await prisma.specialistProfile.findUnique({
      where: { id: specialistId },
      include: { subscription: true },
    });

    if (!spec)
      return res.status(404).json({ message: "Especialista no encontrado" });

    const ms = days * 24 * 60 * 60 * 1000;
    const now = new Date();

    if (!spec.subscription) {
      const created = await prisma.subscription.create({
        data: {
          specialistId,
          status: "TRIALING",
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + ms),
          trialEnd: new Date(now.getTime() + ms),
        },
      });
      return res.json({ ok: true, subscription: created });
    }

    const sub = spec.subscription;

    if (sub.status === "TRIALING" && sub.trialEnd) {
      const updated = await prisma.subscription.update({
        where: { specialistId },
        data: { trialEnd: new Date(sub.trialEnd.getTime() + ms) },
      });
      return res.json({ ok: true, subscription: updated });
    }

    const baseEnd = sub.currentPeriodEnd ?? now;
    const updated = await prisma.subscription.update({
      where: { specialistId },
      data: { currentPeriodEnd: new Date(baseEnd.getTime() + ms) },
    });

    res.json({ ok: true, subscription: updated });
  }
);

export default adminRouter;


