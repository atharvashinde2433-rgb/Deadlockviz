/* ═══════════════════════════════════════════════════════════
   utils.js — Shared utilities across all pages
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ── Active nav link ─────────────────────────────────────── */
(function setActiveNav() {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === page || (page === '' && href === 'index.html')) {
      a.classList.add('active');
    }
  });
})();

/* ── Navbar scroll shadow ────────────────────────────────── */
(function navScroll() {
  const nav = document.querySelector('.navbar');
  if (!nav) return;
  const handler = () => nav.classList.toggle('scrolled', window.scrollY > 20);
  window.addEventListener('scroll', handler, { passive: true });
  handler();
})();

/* ── Hamburger menu ──────────────────────────────────────── */
(function hamburger() {
  const btn = document.querySelector('.hamburger');
  if (!btn) return;
  btn.addEventListener('click', () => {
    document.documentElement.classList.toggle('nav-open');
  });
  // Close on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.navbar')) {
      document.documentElement.classList.remove('nav-open');
    }
  });
})();

/* ── Smooth scroll for anchor links ─────────────────────── */
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id = a.getAttribute('href').slice(1);
    const el = document.getElementById(id);
    if (el) {
      e.preventDefault();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.documentElement.classList.remove('nav-open');
    }
  });
});

/* ── Intersection observer (fade-up on scroll) ───────────── */
(function animateOnScroll() {
  const els = document.querySelectorAll('[data-anim]');
  if (!els.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('fade-up');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  els.forEach(el => io.observe(el));
})();

/* ── Counter animation ───────────────────────────────────── */
function animateCount(el, target, duration = 1800) {
  const start = performance.now();
  const update = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(ease * target).toLocaleString();
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

/* Auto-trigger counters when visible */
(function initCounters() {
  const counters = document.querySelectorAll('[data-count]');
  if (!counters.length) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        animateCount(el, parseInt(el.dataset.count));
        io.unobserve(el);
      }
    });
  }, { threshold: 0.5 });
  counters.forEach(el => io.observe(el));
})();

/* ── Toast notification ──────────────────────────────────── */
function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    Object.assign(container.style, {
      position: 'fixed', bottom: '1.5rem', right: '1.5rem',
      zIndex: '99999', display: 'flex', flexDirection: 'column', gap: '.6rem',
    });
    document.body.appendChild(container);
  }

  const icons = { success: '✅', danger: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.style.cssText = `
    display:flex;align-items:center;gap:.7rem;
    padding:.75rem 1.1rem;border-radius:10px;
    font-size:.875rem;font-weight:500;
    background:var(--card);border:1px solid var(--border2);
    color:var(--text);box-shadow:0 8px 32px rgba(0,0,0,.4);
    transform:translateX(120%);transition:transform .3s cubic-bezier(.4,0,.2,1);
    max-width:320px;
  `;
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => { toast.style.transform = 'translateX(0)'; });

  setTimeout(() => {
    toast.style.transform = 'translateX(120%)';
    setTimeout(() => toast.remove(), 320);
  }, duration);
}

/* ── Copy to clipboard ───────────────────────────────────── */
function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard!', 'success', 2000);
  }).catch(() => showToast('Copy failed', 'danger', 2000));
}

/* ── Format number ───────────────────────────────────────── */
const fmt = n => Number(n).toLocaleString();

/* ── Debounce ────────────────────────────────────────────── */
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ── DOM helpers ─────────────────────────────────────────── */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

/* ── Export globals ──────────────────────────────────────── */
window.DeadlockUtils = { showToast, copyText, animateCount, debounce, $, $$, el };
