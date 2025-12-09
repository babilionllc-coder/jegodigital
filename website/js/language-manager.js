import { translations } from './translations.js';

class LanguageManager {
    constructor() {
        this.currentLang = localStorage.getItem('site_lang') || 'es';
        this.translations = translations;
        this.init();
    }

    init() {
        this.applyLanguage(this.currentLang);
        this.setupListeners();
    }

    setupListeners() {
        // Expose global for inline (backup)
        window.toggleLanguage = () => this.toggleLanguage();

        // Attach event listener directly (Robust way)
        const btn = document.getElementById('lang-toggle');
        if (btn) {
            btn.onclick = (e) => {
                e.preventDefault();
                this.toggleLanguage();
            };
        }
    }

    toggleLanguage() {
        this.currentLang = this.currentLang === 'es' ? 'en' : 'es';
        this.applyLanguage(this.currentLang);
    }

    applyLanguage(lang) {
        // Save preference
        localStorage.setItem('site_lang', lang);
        document.documentElement.lang = lang;

        // Update Text Elements
        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (this.translations[lang][key]) {
                if (el.tagName === 'INPUT' && el.getAttribute('placeholder')) {
                    el.placeholder = this.translations[lang][key];
                } else {
                    el.innerHTML = this.translations[lang][key];
                }
            }
        });

        // Update Toggle Button Icon/Text if it exists
        const toggleBtn = document.getElementById('lang-toggle');
        if (toggleBtn) {
            // Simple approach: Show the flag of the OTHER language (to switch to)
            // Or show current. Let's show Current for clarity.
            // Actually standard is usually: Show the flag of the language you will switch TO, or both.
            // Let's settle on: Show [FLAG] EN  / [FLAG] ES
            toggleBtn.innerHTML = lang === 'es'
                ? '<span class="mr-1">🇺🇸</span> EN'
                : '<span class="mr-1">🇲🇽</span> ES';
        }

        // Dispatch Event for other components (like Chat Widget)
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang, translations: this.translations[lang] } }));
    }
}

// Initialize
const langManager = new LanguageManager();
export default langManager;
