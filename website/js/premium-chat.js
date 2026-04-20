/**
 * ═══════════════════════════════════════════════════════════
 * JEGODIGITAL PREMIUM SERVICE SELECTOR + CALENDLY WIDGET
 * ═══════════════════════════════════════════════════════════
 * Bilingual (EN/ES) floating widget that lets users pick
 * a service, then books a Calendly call with context.
 * Also sends lead data to the JegoDigital webhook.
 * ═══════════════════════════════════════════════════════════
 */
(function () {
    'use strict';

    // ── CONFIGURATION ─────────────────────────────────────
    const WEBHOOK_URL = 'https://us-central1-jegodigital-e02fb.cloudfunctions.net/brevoLead';
    const CALENDLY_BASE = 'https://calendly.com/jegoalexdigital/30min';
    const WHATSAPP_NUMBER = '529987875321';

    // ── SERVICES ──────────────────────────────────────────
    const services = [
        { id: 'lead-capture',   icon: 'phone',       color: '#22c55e', en: '24/7 AI Lead Capture',        es: 'Captura de Leads 24/7 con IA',        tag_en: null, tag_es: null },
        { id: 'seo-local',      icon: 'map-pin',     color: '#C5A059', en: 'Local SEO Positioning',       es: 'Posicionamiento SEO Local',            tag_en: null, tag_es: null },
        { id: 'aeo',            icon: 'brain',       color: '#a855f7', en: 'Smart Search (AEO)',           es: 'Buscadores Inteligentes (AEO)',        tag_en: null, tag_es: null },
        { id: 'social-media',   icon: 'grid-3x3',   color: '#ec4899', en: 'Social Media Management',     es: 'Gestion de Redes Sociales',            tag_en: null, tag_es: null },
        { id: 'website',        icon: 'globe',       color: '#06b6d4', en: 'High-Performance Website',    es: 'Sitio Web de Alto Rendimiento',        tag_en: null, tag_es: null },
        { id: 'video-listing',  icon: 'clapperboard',color: '#6366f1', en: 'Property Listing Videos',     es: 'Videos de Propiedades',                tag_en: null, tag_es: null },
        { id: 'admin-crm',      icon: 'layout',      color: '#0ea5e9', en: 'Admin Panel + CRM',           es: 'Panel Administrativo + CRM',           tag_en: null, tag_es: null },
        { id: 'ai-sales',       icon: 'headset',     color: '#eab308', en: '24/7 AI Sales Assistant',     es: 'Asistente de Ventas 24/7',             tag_en: 'Flagship', tag_es: 'Flagship' },
        { id: 'email-mkt',      icon: 'mail',        color: '#f97316', en: 'Email Marketing & Follow-Up', es: 'Email Marketing y Seguimiento',        tag_en: null, tag_es: null },
    ];

    const bundles = [
        { id: 'pack-growth',      icon: 'rocket', en: 'Growth Pack',     es: 'Pack Crecimiento' },
        { id: 'pack-domination',  icon: 'crown',  en: 'Domination Pack', es: 'Pack Dominacion' },
    ];

    // ── TRANSLATIONS ──────────────────────────────────────
    const i18n = {
        en: {
            badge: 'Chat with us',
            title: 'What do you need?',
            subtitle: 'Pick a service and book a free 30-min call.',
            bundleTitle: 'Or save with a pack:',
            notSure: 'Not sure? Let\'s talk',
            notSureDesc: 'Book a free consultation — we\'ll recommend the right plan.',
            bookCall: 'Book Free Call',
            orWhatsapp: 'Or message us on WhatsApp',
            privacyNote: 'Free consultation. No commitment.',
        },
        es: {
            badge: 'Chatea con nosotros',
            title: '¿Que necesitas?',
            subtitle: 'Elige un servicio y agenda una llamada gratuita de 30 min.',
            bundleTitle: 'O ahorra con un pack:',
            notSure: '¿No estas seguro? Hablemos',
            notSureDesc: 'Agenda una consultoria gratuita — te recomendamos el plan ideal.',
            bookCall: 'Agendar Llamada Gratis',
            orWhatsapp: 'O escribenos por WhatsApp',
            privacyNote: 'Consultoria gratuita. Sin compromiso.',
        }
    };

    // ── DETECT LANGUAGE ───────────────────────────────────
    function getLang() {
        const htmlLang = document.documentElement.lang || 'en';
        return htmlLang.startsWith('es') ? 'es' : 'en';
    }

    let lang = getLang();
    let t = i18n[lang];

    // ── SVG ICONS (Lucide-style) ──────────────────────────
    const icons = {
        'phone':        '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
        'map-pin':      '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
        'brain':        '<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/>',
        'grid-3x3':     '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/>',
        'globe':        '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
        'clapperboard': '<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
        'layout':       '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>',
        'headset':      '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
        'mail':         '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
        'rocket':       '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
        'crown':        '<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/>',
        'calendar':     '<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>',
        'message':      '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
        'arrow-right':  '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
    };

    function svgIcon(name, size) {
        size = size || 20;
        return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (icons[name] || '') + '</svg>';
    }

    // ── INJECT STYLES ─────────────────────────────────────
    const style = document.createElement('style');
    style.textContent = `
        /* ── FAB BUTTON ── */
        #jd-chat-fab {
            position: fixed; bottom: 24px; right: 24px; z-index: 9999;
            display: flex; align-items: center; gap: 10px;
            background: linear-gradient(135deg, #C5A059 0%, #b08d48 100%);
            color: #000; border: none; border-radius: 60px;
            padding: 14px 22px;
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-weight: 700; font-size: 14px; cursor: pointer;
            box-shadow: 0 8px 32px rgba(197,160,89,0.4), 0 2px 8px rgba(0,0,0,0.3);
            transition: all 0.3s cubic-bezier(0.16,1,0.3,1);
            animation: jd-fab-entrance 0.6s cubic-bezier(0.16,1,0.3,1) 1s both;
        }
        #jd-chat-fab:hover { transform: translateY(-3px) scale(1.03); box-shadow: 0 12px 40px rgba(197,160,89,0.5); }
        #jd-chat-fab svg { width: 22px; height: 22px; flex-shrink: 0; }
        #jd-chat-fab .jd-fab-pulse { position: absolute; inset: -4px; border-radius: 60px; border: 2px solid rgba(197,160,89,0.5); animation: jd-pulse 2s ease-in-out infinite; }
        @keyframes jd-pulse { 0%,100% { transform: scale(1); opacity: 0.6; } 50% { transform: scale(1.08); opacity: 0; } }
        @keyframes jd-fab-entrance { from { opacity: 0; transform: translateY(30px) scale(0.8); } to { opacity: 1; transform: translateY(0) scale(1); } }

        /* ── PANEL ── */
        #jd-chat-panel {
            position: fixed; bottom: 90px; right: 24px; z-index: 10000;
            width: 380px; max-height: calc(100vh - 120px);
            background: #0f1115; border: 1px solid rgba(255,255,255,0.08);
            border-radius: 24px; overflow: hidden;
            box-shadow: 0 25px 60px rgba(0,0,0,0.6), 0 0 40px rgba(197,160,89,0.08);
            transform: translateY(20px) scale(0.95); opacity: 0; pointer-events: none;
            transition: all 0.35s cubic-bezier(0.16,1,0.3,1);
            font-family: 'Plus Jakarta Sans', sans-serif;
        }
        #jd-chat-panel.jd-open { transform: translateY(0) scale(1); opacity: 1; pointer-events: all; }

        /* Header */
        .jd-chat-header {
            background: linear-gradient(135deg, rgba(197,160,89,0.15) 0%, rgba(197,160,89,0.05) 100%);
            border-bottom: 1px solid rgba(255,255,255,0.06);
            padding: 20px 24px; display: flex; align-items: flex-start; justify-content: space-between;
        }
        .jd-chat-header-info h3 { color: #fff; font-size: 20px; font-weight: 800; margin: 0 0 4px 0; line-height: 1.2; }
        .jd-chat-header-info p { color: rgba(255,255,255,0.5); font-size: 12px; margin: 0; line-height: 1.5; }
        .jd-chat-close {
            background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08);
            border-radius: 10px; width: 32px; height: 32px;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; color: rgba(255,255,255,0.4); transition: all 0.2s; flex-shrink: 0; margin-top: 2px;
        }
        .jd-chat-close:hover { background: rgba(255,255,255,0.1); color: #fff; }

        /* Body */
        .jd-chat-body { padding: 16px 20px 20px; overflow-y: auto; max-height: calc(100vh - 280px); }

        /* ── SERVICE TILES ── */
        .jd-svc-list { display: flex; flex-direction: column; gap: 8px; }
        .jd-svc-tile {
            display: flex; align-items: center; gap: 12px;
            background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.06);
            border-radius: 14px; padding: 12px 14px;
            cursor: pointer; transition: all 0.25s; text-decoration: none;
        }
        .jd-svc-tile:hover { border-color: rgba(197,160,89,0.4); background: rgba(197,160,89,0.06); transform: translateX(4px); }
        .jd-svc-icon {
            width: 38px; height: 38px; border-radius: 10px;
            display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .jd-svc-icon svg { width: 18px; height: 18px; }
        .jd-svc-info { flex: 1; min-width: 0; }
        .jd-svc-name { color: #fff; font-size: 13px; font-weight: 700; line-height: 1.3; }
        .jd-svc-price { color: rgba(255,255,255,0.4); font-size: 11px; font-family: 'Roboto Mono', monospace; margin-top: 1px; }
        .jd-svc-tag {
            font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;
            padding: 2px 8px; border-radius: 6px; flex-shrink: 0;
        }
        .jd-svc-arrow { color: rgba(255,255,255,0.2); flex-shrink: 0; transition: all 0.25s; }
        .jd-svc-tile:hover .jd-svc-arrow { color: #C5A059; transform: translateX(3px); }

        /* ── BUNDLE SECTION ── */
        .jd-bundle-title {
            color: rgba(255,255,255,0.35); font-size: 10px; font-weight: 700;
            text-transform: uppercase; letter-spacing: 0.1em; margin: 16px 0 8px; padding-top: 16px;
            border-top: 1px solid rgba(255,255,255,0.06);
            font-family: 'Roboto Mono', monospace;
        }
        .jd-bundle-tile {
            display: flex; align-items: center; gap: 12px;
            background: rgba(197,160,89,0.05); border: 1px solid rgba(197,160,89,0.15);
            border-radius: 14px; padding: 12px 14px;
            cursor: pointer; transition: all 0.25s; text-decoration: none;
        }
        .jd-bundle-tile:hover { border-color: rgba(197,160,89,0.5); background: rgba(197,160,89,0.1); transform: translateX(4px); }
        .jd-bundle-save {
            font-size: 9px; font-weight: 800; text-transform: uppercase;
            background: rgba(34,197,94,0.15); color: #22c55e;
            padding: 2px 8px; border-radius: 6px; flex-shrink: 0;
        }

        /* ── NOT SURE / GENERAL CTA ── */
        .jd-notsure {
            margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.06); text-align: center;
        }
        .jd-notsure p { color: rgba(255,255,255,0.35); font-size: 11px; margin: 0 0 10px; line-height: 1.4; }
        .jd-notsure-cta {
            display: inline-flex; align-items: center; gap: 8px;
            background: linear-gradient(135deg, #C5A059 0%, #b08d48 100%);
            color: #000; border: none; border-radius: 12px;
            padding: 11px 20px; font-weight: 700; font-size: 13px;
            cursor: pointer; transition: all 0.3s; text-decoration: none;
            font-family: 'Plus Jakarta Sans', sans-serif;
        }
        .jd-notsure-cta:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(197,160,89,0.35); }
        .jd-notsure-cta svg { width: 16px; height: 16px; }
        .jd-wa-link {
            display: inline-flex; align-items: center; gap: 6px;
            color: #25D366; font-size: 12px; font-weight: 600;
            margin-top: 10px; text-decoration: none; transition: opacity 0.2s;
        }
        .jd-wa-link:hover { opacity: 0.8; }
        .jd-wa-link svg { width: 16px; height: 16px; fill: #25D366; stroke: none; }

        /* Privacy */
        .jd-privacy { text-align: center; font-size: 10px; color: rgba(255,255,255,0.2); margin-top: 12px; }

        /* ── MOBILE ── */
        @media (max-width: 480px) {
            #jd-chat-fab { bottom: 16px; right: 16px; padding: 14px; border-radius: 50%; }
            #jd-chat-fab .jd-fab-label { display: none; }
            #jd-chat-panel { bottom: 0; right: 0; left: 0; width: 100%; max-height: 92vh; border-radius: 24px 24px 0 0; border-bottom: none; }
        }
    `;
    document.head.appendChild(style);

    // ── BUILD CALENDLY URL WITH CONTEXT ───────────────────
    function calendlyUrl(serviceName) {
        return CALENDLY_BASE + '?a1=' + encodeURIComponent(serviceName);
    }

    // ── SEND LEAD TO WEBHOOK (fire-and-forget) ────────────
    function sendLead(serviceName) {
        try {
            fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'Widget Click',
                    source: 'Service Selector Widget',
                    source_url: window.location.href,
                    language: lang,
                    goal: serviceName
                })
            }).catch(function () {});
        } catch (e) {}
    }

    // ── BUILD SERVICE TILE HTML ───────────────────────────
    function buildServiceTile(svc) {
        var name = lang === 'es' ? svc.es : svc.en;
        var tag = lang === 'es' ? svc.tag_es : svc.tag_en;
        var tagHtml = tag ? '<span class="jd-svc-tag" style="background:' + svc.color + '20;color:' + svc.color + '">' + tag + '</span>' : '';

        return '<a href="' + calendlyUrl(name) + '" target="_blank" rel="noopener noreferrer" class="jd-svc-tile" data-service="' + name + '">' +
            '<div class="jd-svc-icon" style="background:' + svc.color + '15;border:1px solid ' + svc.color + '30;color:' + svc.color + '">' + svgIcon(svc.icon, 18) + '</div>' +
            '<div class="jd-svc-info"><div class="jd-svc-name">' + name + '</div></div>' +
            tagHtml +
            '<div class="jd-svc-arrow">' + svgIcon('arrow-right', 14) + '</div>' +
            '</a>';
    }

    function buildBundleTile(b) {
        var name = lang === 'es' ? b.es : b.en;
        return '<a href="' + calendlyUrl(name) + '" target="_blank" rel="noopener noreferrer" class="jd-bundle-tile" data-service="' + name + '">' +
            '<div class="jd-svc-icon" style="background:rgba(197,160,89,0.1);border:1px solid rgba(197,160,89,0.3);color:#C5A059">' + svgIcon(b.icon, 18) + '</div>' +
            '<div class="jd-svc-info"><div class="jd-svc-name">' + name + '</div></div>' +
            '<div class="jd-svc-arrow">' + svgIcon('arrow-right', 14) + '</div>' +
            '</a>';
    }

    // ── WHATSAPP ICON SVG ─────────────────────────────────
    var waIconSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16"><path fill="#25D366" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

    // ── BUILD PANEL CONTENT ───────────────────────────────
    function buildPanelHTML() {
        var servicesHtml = services.map(buildServiceTile).join('');
        var bundlesHtml = bundles.map(buildBundleTile).join('');

        var waUrl = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(lang === 'es' ? 'Hola, me interesa conocer sus servicios' : 'Hi, I\'m interested in your services');

        return '' +
            '<div class="jd-chat-header">' +
                '<div class="jd-chat-header-info">' +
                    '<h3>' + t.title + '</h3>' +
                    '<p>' + t.subtitle + '</p>' +
                '</div>' +
                '<button class="jd-chat-close" aria-label="Close">' +
                    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
                '</button>' +
            '</div>' +
            '<div class="jd-chat-body">' +
                '<div class="jd-svc-list">' + servicesHtml + '</div>' +
                '<div class="jd-bundle-title">' + t.bundleTitle + '</div>' +
                '<div class="jd-svc-list" style="gap:8px">' + bundlesHtml + '</div>' +
                '<div class="jd-notsure">' +
                    '<p>' + t.notSureDesc + '</p>' +
                    '<a href="' + CALENDLY_BASE + '" target="_blank" rel="noopener noreferrer" class="jd-notsure-cta">' +
                        svgIcon('calendar', 16) + ' ' + t.bookCall +
                    '</a>' +
                    '<br>' +
                    '<a href="' + waUrl + '" target="_blank" rel="noopener" class="jd-wa-link">' +
                        waIconSvg + ' ' + t.orWhatsapp +
                    '</a>' +
                '</div>' +
                '<p class="jd-privacy">' + t.privacyNote + '</p>' +
            '</div>';
    }

    // ── CREATE DOM ELEMENTS ───────────────────────────────
    const fab = document.createElement('button');
    fab.id = 'jd-chat-fab';
    fab.setAttribute('aria-label', t.badge);
    fab.innerHTML = '<div class="jd-fab-pulse"></div>' + svgIcon('message', 22) + '<span class="jd-fab-label">' + t.badge + '</span>';

    const panel = document.createElement('div');
    panel.id = 'jd-chat-panel';
    panel.innerHTML = buildPanelHTML();

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    // ── STATE & EVENTS ────────────────────────────────────
    let isOpen = false;

    function toggleChat() {
        isOpen = !isOpen;
        panel.classList.toggle('jd-open', isOpen);
        fab.style.transform = isOpen ? 'scale(0)' : '';
        fab.style.opacity = isOpen ? '0' : '1';
        fab.style.pointerEvents = isOpen ? 'none' : 'all';
    }

    fab.addEventListener('click', toggleChat);

    // Delegate close button click (since panel content may be rebuilt)
    panel.addEventListener('click', function (e) {
        if (e.target.closest('.jd-chat-close')) toggleChat();
        // Track service clicks
        var tile = e.target.closest('.jd-svc-tile, .jd-bundle-tile');
        if (tile) {
            var serviceName = tile.getAttribute('data-service');
            if (serviceName) sendLead(serviceName);
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && isOpen) toggleChat();
    });

    // ── LANGUAGE CHANGE LISTENER ──────────────────────────
    window.addEventListener('languageChanged', function (e) {
        lang = (e.detail && e.detail.lang) || getLang();
        t = i18n[lang] || i18n.en;
        fab.querySelector('.jd-fab-label').textContent = t.badge;
        fab.setAttribute('aria-label', t.badge);
        panel.innerHTML = buildPanelHTML();
    });

})();
