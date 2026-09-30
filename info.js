/* Info blocks, closed state. Loaded blocking in <head> so the class is on
   <html> before first paint and the hidden text never flashes. case.js
   opens them. An external file rather than inline so it passes the
   script-src 'self' CSP in _headers. */
try {
  if (!sessionStorage.getItem('info-open:' + location.pathname)) throw 0;
} catch (e) {
  document.documentElement.classList.add('info-closed');
}
