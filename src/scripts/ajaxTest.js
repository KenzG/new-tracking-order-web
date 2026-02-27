const prisma = require('../db/prismaClient');

const BASE = 'http://localhost:3000';
const fetch = global.fetch || require('node-fetch');

async function waitForServer(timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const r = await fetch(BASE + '/');
      if (r.ok) return true;
    } catch (e) {}
    await new Promise(res => setTimeout(res, 500));
  }
  throw new Error('Server did not start within timeout');
}

async function toUrlParams(obj) {
  return new URLSearchParams(obj).toString();
}

async function run() {
  try {
    console.log('Waiting for server...');
    await waitForServer(15000);
    console.log('Server responsive. Finding a project...');

    let project = await prisma.project.findFirst({ include: { orders: true } });
    if (!project) {
      console.error('No project found in DB. Create a project via the UI first.');
      process.exit(1);
    }
    console.log('Using project:', project.id, project.title);

    // Ensure there is at least one order
    let order = project.orders && project.orders[0];
    if (!order) {
      console.log('No orders found; creating a temporary order via Prisma');
      order = await prisma.order.create({ data: { project: { connect: { id: project.id } }, title: 'Temp order for AJAX test', status: 'PENDING' } });
    }
    console.log('Using order:', order.id, order.title, order.status);

    // 1) Edit order (AJAX edit)
    console.log('\n1) Testing edit endpoint...');
    let editResp = await fetch(`${BASE}/projects/${project.id}/orders/${order.id}/edit`, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ title: order.title + ' (edited)', notes: 'Edited by ajaxTest' })
    });
    console.log('Edit status:', editResp.status);
    let editJson = await editResp.json();
    console.log('Edit response:', editJson);

    // 2) Status update
    console.log('\n2) Testing status update endpoint...');
    let statusResp = await fetch(`${BASE}/projects/${project.id}/orders/${order.id}/status`, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ status: 'IN_PROGRESS' })
    });
    console.log('Status update HTTP:', statusResp.status);
    let statusJson = await statusResp.json();
    console.log('Status response:', statusJson);

    // 3) Regenerate token
    console.log('\n3) Testing token regenerate endpoint...');
    let regenResp = await fetch(`${BASE}/projects/${project.id}/token/regenerate`, {
      method: 'POST',
      headers: { 'Accept': 'application/json' }
    });
    console.log('Regenerate HTTP:', regenResp.status);
    let regenJson = await regenResp.json();
    console.log('Regenerate response:', regenJson);

    // 4) Revoke token
    console.log('\n4) Testing token revoke endpoint...');
    let revokeResp = await fetch(`${BASE}/projects/${project.id}/token/revoke`, {
      method: 'POST',
      headers: { 'Accept': 'application/json' }
    });
    console.log('Revoke HTTP:', revokeResp.status);
    let revokeJson = await revokeResp.json();
    console.log('Revoke response:', revokeJson);

    // 5) Delete order
    console.log('\n5) Testing delete endpoint...');
    let delResp = await fetch(`${BASE}/projects/${project.id}/orders/${order.id}/delete`, {
      method: 'POST',
      headers: { 'Accept': 'application/json' }
    });
    console.log('Delete HTTP:', delResp.status);
    let delJson = await delResp.json();
    console.log('Delete response:', delJson);

    console.log('\nAJAX tests complete.');
    process.exit(0);
  } catch (err) {
    console.error('AJAX test error:', err);
    process.exit(2);
  }
}

run();
