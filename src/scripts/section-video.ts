function initSectionVideos() {
  const videos = document.querySelectorAll<HTMLVideoElement>('[data-section-video] video');

  const playVisible = (video: HTMLVideoElement) => {
    video.muted = true;
    const p = video.play();
    if (p) p.catch(() => {});
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const video = entry.target as HTMLVideoElement;
        if (entry.isIntersecting) playVisible(video);
        else video.pause();
      });
    },
    { threshold: 0.2 }
  );

  videos.forEach((video) => {
    video.addEventListener('error', () => video.classList.add('is-hidden'));
    observer.observe(video);
  });
}

initSectionVideos();
