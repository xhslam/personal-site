function initArticleToc() {
  const links = document.querySelectorAll('.toc-link');
  const headings = Array.from(links)
    .map((link) => {
      const slug = link.getAttribute('data-slug');
      return slug ? document.getElementById(slug) : null;
    })
    .filter(Boolean) as HTMLElement[];

  if (!headings.length) return;

  const setActive = (id: string) => {
    links.forEach((link) => {
      link.classList.toggle('active', link.getAttribute('data-slug') === id);
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]?.target.id) setActive(visible[0].target.id);
    },
    { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
  );

  headings.forEach((h) => observer.observe(h));
}

initArticleToc();
