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
        // Attach event listener to ALL toggle buttons (Desktop & Mobile)
        const btns = document.querySelectorAll('.lang-toggle-btn');
        btns.forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                this.toggleLanguage();
            };
        });
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
        // Update Toggle Button Icon/Text (Handle Multiple Buttons)
        const toggleBtns = document.querySelectorAll('.lang-toggle-btn');
        toggleBtns.forEach(btn => {
            btn.innerHTML = lang === 'es'
                ? '<span class="mr-1">🇺🇸</span> EN'
                : '<span class="mr-1">🇲🇽</span> ES';
        });

        // Dispatch Event for other components (like Chat Widget)
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang, translations: this.translations[lang] } }));
    }
}

// Initialize
const langManager = new LanguageManager();
export default langManager;
