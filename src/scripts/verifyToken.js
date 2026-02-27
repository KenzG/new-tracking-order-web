const prisma = require('../db/prismaClient');

async function main() {
  const project = await prisma.project.findFirst({ include: { owner: true } });
  if (!project) return console.log('No project found in DB');
  console.log('Project ID:', project.id);
  console.log('Title:', project.title);
  console.log('Client Name:', project.clientName || project.owner?.name || 'N/A');
  console.log('Access Token:', project.accessToken || '(none)');
  console.log('Client URL: http://localhost:3000/client/' + (project.accessToken || '[no-token]'));
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
