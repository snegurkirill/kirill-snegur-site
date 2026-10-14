/* /components.html only: put the Info specimens back to closed, so the click
   can be watched more than once. info.js is the real component, untouched —
   this just undoes what it stored for the session. */
(function () {
  var reset = document.querySelector('[data-info-reset]');
  if (!reset) return;
  reset.addEventListener('click', function () {
    try { sessionStorage.removeItem('info-open:' + location.pathname); } catch (e) {}
    document.documentElement.classList.add('info-closed');
  });
})();
