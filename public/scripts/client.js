// client-side interactions for previewing images and submitting comments

window.addEventListener('DOMContentLoaded', () => {
    // image preview logic (delegated to ensure clicks work even if markup changes)
    document.addEventListener('click', (e) => {
        const container = e.target.closest('.order-image');
        if (!container) return;
        const src = container.getAttribute('data-src');
        if (!src) return;
        const modal = document.getElementById('imageModal');
        const img = document.getElementById('modalImg');
        img.src = src;
        modal.classList.remove('hidden');
    });

    // clicking outside the image closes modal
    const modal = document.getElementById('imageModal');
    const closeBtn = document.getElementById('modalClose');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    }
    // Esc key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            modal.classList.add('hidden');
        }
    });

    // comment form submit via fetch
    document.querySelectorAll('.client-comment-form').forEach(form => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const orderId = form.getAttribute('data-order-id');
            const textarea = form.querySelector('textarea');
            const comment = textarea.value.trim();
            if (!comment) return;
            // find project token from URL
            const parts = window.location.pathname.split('/');
            const token = parts[parts.indexOf('client') + 1];
            try {
                const res = await fetch(`/client/${token}/orders/${orderId}/comment`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                    body: new URLSearchParams({comment})
                });
                const data = await res.json();
                if (data.success) {
                    // show confirmation and update displayed comment
                    let existing = form.previousElementSibling;
                    if (existing && existing.classList.contains('client-comment-display')) {
                        existing.textContent = 'Your comment: ' + comment;
                    } else {
                        const p = document.createElement('p');
                        p.className = 'client-comment-display mt-2 text-sm text-indigo-700 bg-indigo-100 p-2 rounded';
                        p.textContent = 'Your comment: ' + comment;
                        form.parentNode.insertBefore(p, form);
                    }
                }
            } catch (err) {
                console.error('comment error', err);
            }
        });
    });

    // approve button handler
    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('.approve-btn');
        if (!btn) return;
        const orderId = btn.getAttribute('data-order-id');
        const parts = window.location.pathname.split('/');
        const token = parts[parts.indexOf('client') + 1];
        try {
            const res = await fetch(`/client/${token}/orders/${orderId}/approve`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                // replace approve button with confirmation and disable comment form
                btn.textContent = 'Approved';
                btn.classList.remove('bg-green-500');
                btn.classList.add('bg-gray-300', 'text-gray-700');
                btn.disabled = true;
                // disable textarea and submit on same card
                const form = btn.closest('div').querySelector('.client-comment-form');
                if (form) {
                    form.querySelector('textarea').disabled = true;
                    form.querySelector('button[type=submit]').disabled = true;
                }
                // update status badge if present
                const badge = btn.closest('div').querySelector('span');
                if (badge) {
                    badge.textContent = 'APPROVED';
                    badge.className = 'px-3 py-1 rounded text-sm font-semibold border text-teal-800 bg-teal-100 border-teal-300';
                }
            }
        } catch (err) {
            console.error('approve error', err);
        }
    });
});