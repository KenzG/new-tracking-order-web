const express = require("express");
const router = express.Router();
const prisma = require('../db/prismaClient');

router.get('/:token', async (req, res) => {
  const token = req.params.token;

  try {
    const project = await prisma.project.findUnique({
      where: { accessToken: token },
      include: { orders: true, owner: true }
    });

    if (!project) {
      return res.status(404).send('Project not found');
    }

    // hide the main navbar when showing a client link
    res.render('client/project', { project, hideNav: true });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// allow client to leave a comment on an order (revision request, etc.)
// comments are blocked once status is COMPLETED or APPROVED
router.post('/:token/orders/:orderId/comment', async (req, res) => {
  const { token, orderId } = req.params;
  const { comment } = req.body;

  try {
    const project = await prisma.project.findUnique({
      where: { accessToken: token },
      include: { orders: true }
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const order = project.orders.find(o => o.id === parseInt(orderId));
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.status === 'COMPLETED' || order.status === 'APPROVED') {
      return res.status(400).json({ error: 'Comments not allowed on completed/approved orders' });
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { clientComment: comment }
    });

    res.json({ success: true, order: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// allow client to mark an order approved
router.post('/:token/orders/:orderId/approve', async (req, res) => {
  const { token, orderId } = req.params;
  try {
    const project = await prisma.project.findUnique({
      where: { accessToken: token },
      include: { orders: true }
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const order = project.orders.find(o => o.id === parseInt(orderId));
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: 'APPROVED' }
    });

    res.json({ success: true, order: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
