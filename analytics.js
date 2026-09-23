/* PostHog, EU region.
   Loaded from every page so the key and settings live in one place.
   The project key is public by design — it ships inside the page source. */
(function () {
  var TOKEN      = 'phc_CzyAS87Ua2HLKMiKTMkasSUS9u3QUiXMWaAZPD5uN5Xe';
  var API_HOST   = 'https://eu.i.posthog.com';       // where events go
  var ASSET_HOST = 'https://eu-assets.i.posthog.com'; // where the library lives

  var s = document.createElement('script');
  s.src = ASSET_HOST + '/static/array.js';
  s.defer = true;
  s.onload = function () {
    if (!window.posthog || typeof window.posthog.init !== 'function') return;
    window.posthog.init(TOKEN, {
      api_host: API_HOST,
      ui_host: 'https://eu.posthog.com'
    });
  };
  document.head.appendChild(s);
})();
