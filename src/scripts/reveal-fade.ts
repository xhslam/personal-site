function initRevealFade() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduced) {
    document.querySelectorAll('.reveal-bounce, .reveal-bounce-hero').forEach((el) => {
      el.classList.add('is-visible');
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          entry.target.classList.remove('is-hidden');
        } else {
          entry.target.classList.remove('is-visible');
          entry.target.classList.add('is-hidden');
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -4% 0px' }
  );

  document.querySelectorAll('.reveal-bounce').forEach((el) => {
    const delay = el.getAttribute('data-reveal-delay');
    if (delay) (el as HTMLElement).style.setProperty('--reveal-delay', delay);
    observer.observe(el);
  });

  document.querySelectorAll('.reveal-bounce-hero').forEach((el, i) => {
    (el as HTMLElement).style.setProperty('--reveal-delay', `${i * 70}ms`);
    requestAnimationFrame(() => {
      setTimeout(() => el.classList.add('is-visible'), 80);
    });
  });
}

initRevealFade();
