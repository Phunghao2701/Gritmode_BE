import { PrismaClient } from '@prisma/client';

/**
 * Prisma Client Singleton Instance
 * Ngăn chặn rò rỉ kết nối (Connection Leak / Exhaustion) trong môi trường phát triển & SSR
 */
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;
