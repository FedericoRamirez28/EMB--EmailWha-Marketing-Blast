import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();

  const email = process.env.ADMIN_EMAIL || 'admin@emb.local';
  const password = process.env.ADMIN_PASSWORD || 'admin123';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('Admin ya existe:', email);
    await prisma.$disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: { email, passwordHash, name: 'Admin' },
  });

  console.log('Admin creado:', email, 'pass:', password);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
