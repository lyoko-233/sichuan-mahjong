// v45 · 2026-11-19: WeChat cannot reliably launch an external browser from a web link.
(() => {
  if (!/MicroMessenger/i.test(navigator.userAgent)) return;
  const guide = document.getElementById('wechat-browser-guide');
  const steps = document.getElementById('wechat-browser-steps');
  const link = document.getElementById('wechat-game-link');
  const feedback = document.getElementById('wechat-copy-feedback');
  const close = document.getElementById('wechat-guide-close');
  let previousFocus = null;
  link.value = new URL('./', location.href).href;
  function openGuide() {
    previousFocus = document.activeElement;
    guide.hidden = false;
    close.focus();
  }
  function closeGuide() {
    guide.hidden = true;
    previousFocus?.focus();
  }
  document.querySelectorAll('[data-wechat-only]').forEach(element => { element.hidden = false; });
  document.querySelectorAll('[data-open-browser-guide]').forEach(button => button.addEventListener('click', openGuide));
  close.addEventListener('click', closeGuide);
  document.getElementById('wechat-browser-help').addEventListener('click', () => {
    steps.hidden = false;
    steps.focus();
  });
  document.getElementById('wechat-copy-link').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(link.value);
      feedback.textContent = '链接已复制，请粘贴到手机浏览器打开。';
    } catch {
      link.focus();
      link.select();
      feedback.textContent = '请长按上方链接复制，再粘贴到手机浏览器打开。';
    }
  });
  guide.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeGuide();
    if (event.key !== 'Tab') return;
    const controls = [...guide.querySelectorAll('button, input')];
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  // v46 · 2026-11-19: portrait phones see the orientation entry first, with a help button.
  if (!matchMedia('(max-width:700px) and (orientation:portrait)').matches) openGuide();
})();
