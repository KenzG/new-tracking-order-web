const prisma = require('../db/prismaClient');
const crypto = require('crypto');

async function main() {
  const project = await prisma.project.findFirst();
  if (!project) return console.log('No project found');
  console.log('Before token:', project.accessToken);
  const newToken = crypto.randomBytes(12).toString('hex');
  const updated = await prisma.project.update({ where: { id: project.id }, data: { accessToken: newToken } });
  console.log('After token:', updated.accessToken);
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
