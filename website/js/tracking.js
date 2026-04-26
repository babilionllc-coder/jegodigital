// JegoDigital tracking helper - dataLayer pushes for click + form events
// Loaded after GTM container is initialized
(function() {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];

  function push(event, params) {
    window.dataLayer.push(Object.assign({event: event}, params || {}));
  }

  // Click delegation
  document.addEventListener('click', function(e) {
    var a = e.target.closest('a');
    if (!a || !a.href) return;
    var href = a.href.toLowerCase();

    if (href.indexOf('wa.me/') !== -1 || href.indexOf('whatsapp.com/send') !== -1) {
      push('whatsapp_click', {
        link_url: a.href,
        link_text: (a.innerText || '').trim().slice(0, 100),
        page_path: window.location.pathname
      });
    } else if (href.indexOf('calendly.com/') !== -1) {
      push('calendly_click', {
        link_url: a.href,
        link_text: (a.innerText || '').trim().slice(0, 100),
        page_path: window.location.pathname
      });
    } else if (href.indexOf('tel:') === 0) {
      push('phone_click', {
        phone_number: a.href.replace('tel:', ''),
        link_text: (a.innerText || '').trim().slice(0, 100),
        page_path: window.location.pathname
      });
    } else if (href.indexOf('mailto:') === 0) {
      push('email_click', {
        email: a.href.replace('mailto:', '').split('?')[0],
        page_path: window.location.pathname
      });
    }
  }, true);

  // Form submit delegation
  document.addEventListener('submit', function(e) {
    var f = e.target;
    if (!f || f.tagName !== 'FORM') return;
    var formId = f.id || f.getAttribute('name') || 'unknown_form';
    push('form_submit', {
      form_id: formId,
      page_path: window.location.pathname
    });
    // Also fire generate_lead for known lead forms
    var leadForms = ['auditForm', 'bookingForm', 'auditoriaForm', 'trojanForm'];
    if (leadForms.indexOf(formId) !== -1) {
      push('generate_lead', {
        form_id: formId,
        value: 100,
        currency: 'MXN',
        page_path: window.location.pathname
      });
    }
  }, true);
})();
