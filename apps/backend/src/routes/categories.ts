import { Router } from 'express'

import { prisma } from '../lib/prisma'

export const categories = Router()

// GET /categories
categories.get('/', async (_req, res) => {
  const data = await prisma.serviceCategoryGroup.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      categories: {
        where: { isActive: true },
        orderBy: { name: 'asc' },
      },
    },
  })
  res.json(data)
})
