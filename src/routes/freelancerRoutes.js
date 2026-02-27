const express = require("express");
const router = express.Router();
const prisma = require("../db/prismaClient");
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ensure upload directory exists (match the static root at /public)
// __dirname is src/routes, so go up two levels to workspace root
const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const safe = file.originalname.replace(/[^a-z0-9.\-\_]/gi, '-');
    cb(null, Date.now() + '-' + safe);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router.get("/", async (req, res) => {
  try {
    // Fetch all projects with orders for all freelancers
    const projects = await prisma.project.findMany({
      include: { owner: true, orders: true },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate stats
    const totalProjects = projects.length;
    const activeProjects = projects.filter(p => p.orders.some(o => o.status === 'IN_PROGRESS')).length;
    const completedProjects = projects.filter(p => p.orders.every(o => o.status === 'COMPLETED')).length;
    const pendingProjects = projects.filter(p => {
      // project is pending if it has at least one PENDING order and is not active or completed
      const hasPending = p.orders.some(o => o.status === 'PENDING');
      const isActive = p.orders.some(o => o.status === 'IN_PROGRESS');
      const isAllCompleted = p.orders.length > 0 && p.orders.every(o => o.status === 'COMPLETED');
      return hasPending && !isActive && !isAllCompleted;
    }).length;

    res.render("freelancer/dashboard", {
      projects,
      stats: { totalProjects, activeProjects, completedProjects, pendingProjects }
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// show form for new project
router.get('/projects/new', (req, res) => {
  res.render('freelancer/newProject');
});

// profile page
router.get('/profile', async (req, res) => {
  try {
    const user = await prisma.user.findFirst();
    if (!user) return res.status(404).send('User not found');
    res.render('freelancer/profile', { user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// settings page
router.get('/settings', async (req, res) => {
  try {
    const user = await prisma.user.findFirst();
    if (!user) return res.status(404).send('User not found');
    res.render('freelancer/settings', { user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// create new project
router.post('/projects', async (req, res) => {
  try {
    const { title, description, clientName, clientEmail, deadline } = req.body;
    const accessToken = require('crypto').randomBytes(8).toString('hex');

    // pick a freelancer owner (fallback to first user)
    let owner = await prisma.user.findFirst({ where: { role: 'FREELANCER' } });
    if (!owner) {
      owner = await prisma.user.findFirst();
    }
    // still no owner? create a dummy freelancer account so we have an ID
    if (!owner) {
      owner = await prisma.user.create({
        data: {
          email: 'freelancer@example.com',
          role: 'FREELANCER',
          name: 'Freelancer'
        }
      });
    }

    const project = await prisma.project.create({
      data: {
        title,
        description,
        clientName,
        clientEmail,
        deadline: deadline ? new Date(deadline) : null,
        accessToken,
        ownerId: owner.id
      }
    });
    res.redirect(`/projects/${project.id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// detail page for a single project (with order management)
router.get('/projects/:id', async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { orders: true }
    });
    if (!project) return res.status(404).send('Project not found');
    res.render('freelancer/projectDetail', { project });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// add order (deliverable) to project - title and notes only, file uploads separately
router.post('/projects/:id/orders', async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const { notes, title } = req.body;
    
    if (!title || title.trim() === '') {
      return res.status(400).send('Title is required');
    }

    await prisma.order.create({
      data: {
        project: { connect: { id: projectId } },
        notes: notes || null,
        status: 'PENDING',
        title: title.trim(),
        filePath: null
      }
    });
    res.redirect(`/projects/${projectId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// update order status
router.post('/projects/:id/orders/:orderId/status', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const { status } = req.body;
    await prisma.order.update({
      where: { id: orderId },
      data: { status }
    });
    if (req.accepts('json')) {
      return res.json({ status: 'ok' });
    }
    res.redirect(`/projects/${req.params.id}`);
  } catch (err) {
    console.error(err);
    if (req.accepts('json')) {
      return res.status(500).json({ status: 'error', message: 'Server error' });
    }
    res.status(500).send('Server error');
  }
});

// upload file to existing order (deliverable)
router.post('/projects/:id/orders/:orderId/upload', upload.single('file'), async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const projectId = parseInt(req.params.id);
    
    if (!req.file) {
      if (req.accepts('json')) return res.status(400).json({ status: 'error', message: 'No file provided' });
      return res.status(400).send('No file provided');
    }

    // Get the order to potentially clean up old file
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      if (req.accepts('json')) return res.status(404).json({ status: 'error', message: 'Order not found' });
      return res.status(404).send('Order not found');
    }

    // Remove old file if exists
    if (order.filePath) {
      const oldFp = path.join(__dirname, '..', '..', 'public', order.filePath.replace(/^\//, ''));
      try { if (fs.existsSync(oldFp)) fs.unlinkSync(oldFp); } catch (e) { console.warn('Failed to remove old file', oldFp, e); }
    }

    // Update order with new file
    const filePath = `/uploads/${req.file.filename}`;
    await prisma.order.update({
      where: { id: orderId },
      data: { filePath }
    });

    if (req.accepts('json')) {
      return res.json({ status: 'ok', filePath });
    }
    res.redirect(`/projects/${projectId}`);
  } catch (err) {
    console.error(err);
    if (req.accepts('json')) {
      return res.status(500).json({ status: 'error', message: 'Server error' });
    }
    res.status(500).send('Server error');
  }
});

// edit order title and notes
router.post('/projects/:id/orders/:orderId/edit', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const projectId = parseInt(req.params.id);
    const { title, notes } = req.body;

    if (!title || title.trim() === '') {
      if (req.accepts('json')) return res.status(400).json({ status: 'error', message: 'Title is required' });
      return res.status(400).send('Title is required');
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        title: title.trim(),
        notes: notes || null
      }
    });

    if (req.accepts('json')) {
      return res.json({ status: 'ok', title: updated.title, notes: updated.notes });
    }
    res.redirect(`/projects/${projectId}`);
  } catch (err) {
    console.error(err);
    if (req.accepts('json')) {
      return res.status(500).json({ status: 'error', message: 'Server error' });
    }
    res.status(500).send('Server error');
  }
});

// regenerate token
router.post('/projects/:id/token/regenerate', async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const newToken = require('crypto').randomBytes(12).toString('hex');
    await prisma.project.update({
      where: { id: projectId },
      data: { accessToken: newToken }
    });
    if (req.accepts('json')) {
      return res.json({ status: 'ok', accessToken: newToken });
    }
    res.redirect(`/projects/${projectId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// revoke token
router.post('/projects/:id/token/revoke', async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    await prisma.project.update({
      where: { id: projectId },
      data: { accessToken: null }
    });
    if (req.accepts('json')) {
      return res.json({ status: 'ok' });
    }
    res.redirect(`/projects/${projectId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// delete order (deliverable)
router.post('/projects/:id/orders/:orderId/delete', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const projectId = parseInt(req.params.id);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).send('Order not found');

    // remove file if exists
    if (order.filePath) {
      const fp = path.join(__dirname, '..', '..', 'public', order.filePath.replace(/^\//, ''));
      try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch (e) { console.warn('Failed to remove file', fp, e); }
    }

    await prisma.order.delete({ where: { id: orderId } });
    if (req.accepts('json')) {
      return res.json({ status: 'ok' });
    }
    res.redirect(`/projects/${projectId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// get project data for edit modal
router.get('/projects/:id/edit-data', async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({
      id: project.id,
      title: project.title,
      description: project.description,
      clientName: project.clientName,
      deadline: project.deadline ? new Date(project.deadline).toISOString().split('T')[0] : ''
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// update project
router.post('/projects/:id/edit', async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const { title, description, clientName, deadline } = req.body;

    if (!title || title.trim() === '') {
      if (req.accepts('json')) return res.status(400).json({ error: 'Title is required' });
      return res.status(400).send('Title is required');
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: {
        title: title.trim(),
        description: description || null,
        clientName: clientName || null,
        clientEmail: clientEmail || null,
        deadline: deadline ? new Date(deadline) : null
      }
    });

    if (req.accepts('json')) {
      return res.json({ status: 'ok', project: updated });
    }
    res.redirect(`/projects/${projectId}`);
  } catch (err) {
    console.error(err);
    if (req.accepts('json')) {
      return res.status(500).json({ status: 'error', message: 'Server error' });
    }
    res.status(500).send('Server error');
  }
});

// delete project (and cleanup files)
router.post('/projects/:id/delete', async (req, res) => {

  try {
    const projectId = parseInt(req.params.id);
    const project = await prisma.project.findUnique({ where: { id: projectId }, include: { orders: true } });
    if (!project) {
      if (req.accepts('json')) return res.status(404).json({ error: 'Project not found' });
      return res.status(404).send('Project not found');
    }

    // delete attached files and remove order rows
    for (const ord of project.orders) {
      if (ord.filePath) {
        const fp = path.join(__dirname, '..', '..', 'public', ord.filePath.replace(/^\//, ''));
        try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch (e) { console.warn('Failed to remove file', fp, e); }
      }
    }

    // remove the orders themselves so the project-delete won't be blocked by foreign keys
    await prisma.order.deleteMany({ where: { projectId } });

    await prisma.project.delete({ where: { id: projectId } });
    if (req.accepts('json')) {
      return res.json({ status: 'ok' });
    }
    res.redirect('/');
  } catch (err) {
    console.error(err);
    if (req.accepts('json')) {
      return res.status(500).json({ status: 'error', message: 'Server error' });
    }
    res.status(500).send('Server error');
  }
});

// return orders data for a project (used by polling)
router.get('/projects/:id/orders', async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const orders = await prisma.order.findMany({ where: { projectId }, select: { id: true, clientComment: true, status: true, filePath: true } });
    res.json({ orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Server-Sent Events endpoint for real-time order updates
router.get('/projects/:id/events', (req, res) => {
  const projectId = parseInt(req.params.id);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // send a comment: heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    res.end();
  });
});

module.exports = router;
