//apps/backend/src/routes/categories.ts
import { Router } from 'express';

import { prisma } from '../lib/prisma';
import { dbg, debugSpecialists } from '../utils/debug'; // ✅ solo para debug opcional

export const categories = Router();

// GET /categories
categories.get('/', async (_req, res) => {
  const data = await prisma.serviceCategoryGroup.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      slug: true,
      sortOrder: true,
      categories: {
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  dbg(debugSpecialists, '[categories] GET /categories -> groups:', data.length);

  res.json({ ok: true, groups: data });
});
