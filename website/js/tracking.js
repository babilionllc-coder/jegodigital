// JegoDigital tracking helper - fires GA4 events for click + form interactions
// Uses gtag('event', name, {send_to: GA4_ID}) — works whether or not GTM has explicit Event tags
// Also pushes dataLayer events so future GTM tags can react if needed
(function() {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];

  var GA4_ID = 'G-6BFHHN8BJQ';

  function gtagSafe(eventName, params) {
    // Push to dataLayer (for GTM Event triggers)
    var dlPayload = Object.assign({event: eventName}, params || {});
    window.dataLayer.push(dlPayload);

    // Also fire gtag('event', ...) with send_to so GA4 receives it directly
    if (typeof window.gtag === 'function') {
      var gtagParams = Object.assign({send_to: GA4_ID}, params || {});
      window.gtag('event', eventName, gtagParams);
    }
  }

  // Click delegation
  document.addEventListener('click', function(e) {
    var a = e.target.closest('a');
    if (!a || !a.href) return;
    var href = a.href.toLowerCase();
    var linkText = (a.innerText || '').trim().slice(0, 100);
    var pagePath = window.location.pathname;

    if (href.indexOf('wa.me/') !== -1 || href.indexOf('whatsapp.com/send') !== -1) {
      gtagSafe('whatsapp_click', {
        link_url: a.href,
        link_text: linkText,
        page_path: pagePath
      });
    } else if (href.indexOf('calendly.com/') !== -1) {
      gtagSafe('calendly_click', {
        link_url: a.href,
        link_text: linkText,
        page_path: pagePath
      });
    } else if (href.indexOf('tel:') === 0) {
      gtagSafe('phone_click', {
        phone_number: a.href.replace('tel:', ''),
        link_text: linkText,
        page_path: pagePath
      });
    } else if (href.indexOf('mailto:') === 0) {
      gtagSafe('email_click', {
        email: a.href.replace('mailto:', '').split('?')[0],
        page_path: pagePath
      });
    }
  }, true);

  // Form submit delegation
  document.addEventListener('submit', function(e) {
    var f = e.target;
    if (!f || f.tagName !== 'FORM') return;
    var formId = f.id || f.getAttribute('name') || 'unknown_form';
    var pagePath = window.location.pathname;

    gtagSafe('form_submit', {
      form_id: formId,
      page_path: pagePath
    });

    // Also fire generate_lead for known lead forms (this is the conversion event)
    var leadForms = ['auditForm', 'bookingForm', 'auditoriaForm', 'trojanForm'];
    if (leadForms.indexOf(formId) !== -1) {
      gtagSafe('generate_lead', {
        form_id: formId,
        value: 100,
        currency: 'MXN',
        page_path: pagePath
      });
    }
  }, true);
})();
