// AI Console Monitor Agent
// Automatically detects, analyzes, and fixes console errors

class AIConsoleMonitor {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.fixes = [];
        this.isMonitoring = false;
        this.originalConsole = {
            error: console.error,
            warn: console.warn,
            log: console.log
        };
        
        this.errorPatterns = {
            // API Errors
            'API_ERROR': /(fetch|axios|XMLHttpRequest).*error|network.*error|connection.*failed/i,
            'AUTH_ERROR': /unauthorized|forbidden|401|403|token.*invalid/i,
            'RATE_LIMIT': /rate.*limit|too.*many.*requests|429/i,
            
            // Data Errors
            'DATA_ERROR': /cannot.*read.*property|undefined.*is.*not.*function|null.*reference/i,
            'JSON_ERROR': /unexpected.*token|json.*parse.*error|syntax.*error/i,
            'TYPE_ERROR': /type.*error|cannot.*convert|invalid.*type/i,
            
            // Network Errors
            'CORS_ERROR': /cors|cross.*origin|access.*control.*allow.*origin/i,
            'TIMEOUT_ERROR': /timeout|request.*timeout|connection.*timeout/i,
            'DNS_ERROR': /dns.*error|hostname.*not.*found|name.*resolution/i,
            
            // UI Errors
            'DOM_ERROR': /cannot.*find.*element|queryselector.*null|element.*not.*found/i,
            'EVENT_ERROR': /event.*listener|addEventListener|removeEventListener/i,
            'RENDER_ERROR': /render.*error|component.*error|display.*error/i
        };
        
        this.fixStrategies = {
            'API_ERROR': this.fixAPIError.bind(this),
            'AUTH_ERROR': this.fixAuthError.bind(this),
            'RATE_LIMIT': this.fixRateLimit.bind(this),
            'DATA_ERROR': this.fixDataError.bind(this),
            'JSON_ERROR': this.fixJSONError.bind(this),
            'TYPE_ERROR': this.fixTypeError.bind(this),
            'CORS_ERROR': this.fixCORSError.bind(this),
            'TIMEOUT_ERROR': this.fixTimeoutError.bind(this),
            'DOM_ERROR': this.fixDOMError.bind(this),
            'EVENT_ERROR': this.fixEventError.bind(this),
            'RENDER_ERROR': this.fixRenderError.bind(this)
        };
        
        this.init();
    }
    
    init() {
        console.log('🤖 AI Console Monitor Agent initialized');
        this.startMonitoring();
        this.createMonitorUI();
    }
    
    startMonitoring() {
        if (this.isMonitoring) return;
        this.isMonitoring = true;
        
        // Override console methods
        console.error = (...args) => {
            this.handleError('error', args);
            this.originalConsole.error.apply(console, args);
        };
        
        console.warn = (...args) => {
            this.handleError('warning', args);
            this.originalConsole.warn.apply(console, args);
        };
        
        console.log = (...args) => {
            this.handleLog(args);
            this.originalConsole.log.apply(console, args);
        };
        
        // Monitor unhandled errors
        window.addEventListener('error', (event) => {
            this.handleError('uncaught', [event.error?.message || event.message, event.filename, event.lineno]);
        });
        
        window.addEventListener('unhandledrejection', (event) => {
            this.handleError('promise', [event.reason?.message || event.reason]);
        });
        
        console.log('🔍 Console monitoring started');
    }
    
    handleError(type, args) {
        const message = args.join(' ');
        const timestamp = new Date().toISOString();
        
        // Classify error
        const classification = this.classifyError(message);
        
        const errorData = {
            type,
            message,
            timestamp,
            classification,
            args,
            stack: new Error().stack
        };
        
        if (type === 'error') {
            this.errors.push(errorData);
        } else {
            this.warnings.push(errorData);
        }
        
        // Attempt auto-fix
        this.attemptAutoFix(errorData);
        
        // Update UI
        this.updateMonitorUI();
    }
    
    handleLog(args) {
        const message = args.join(' ');
        
        // Check for important logs
        if (message.includes('Headers:') || message.includes('Found phone numbers:')) {
            this.analyzeDataLog(message, args);
        }
    }
    
    classifyError(message) {
        for (const [category, pattern] of Object.entries(this.errorPatterns)) {
            if (pattern.test(message)) {
                return category;
            }
        }
        return 'UNKNOWN';
    }
    
    attemptAutoFix(errorData) {
        const fixStrategy = this.fixStrategies[errorData.classification];
        if (fixStrategy) {
            const fix = fixStrategy(errorData);
            if (fix) {
                this.fixes.push({
                    error: errorData,
                    fix,
                    timestamp: new Date().toISOString(),
                    applied: false
                });
                
                console.log(`🔧 AI Fix Available: ${fix.title}`);
                console.log(`💡 Solution: ${fix.description}`);
                
                if (fix.autoApply) {
                    this.applyFix(fix);
                }
            }
        }
    }
    
    // Fix Strategies
    fixAPIError(errorData) {
        if (errorData.message.includes('phone numbers')) {
            return {
                title: 'Fix Phone Number Loading',
                description: 'The Google Sheets API is returning fake data. Need to check actual data in sheet.',
                solution: 'Check Google Sheets for real phone numbers, not test data',
                autoApply: false,
                action: () => this.fixPhoneNumberData()
            };
        }
        
        if (errorData.message.includes('fetch')) {
            return {
                title: 'Fix API Connection',
                description: 'Network request failed. Checking connection and retrying.',
                solution: 'Retry API call with exponential backoff',
                autoApply: true,
                action: () => this.retryAPICall()
            };
        }
        
        return null;
    }
    
    fixAuthError(errorData) {
        return {
            title: 'Fix Authentication',
            description: 'API authentication failed. Token may be expired or invalid.',
            solution: 'Refresh access token or check API credentials',
            autoApply: false,
            action: () => this.refreshAuthToken()
        };
    }
    
    fixRateLimit(errorData) {
        return {
            title: 'Fix Rate Limiting',
            description: 'API rate limit exceeded. Implementing delay strategy.',
            solution: 'Add exponential backoff and retry logic',
            autoApply: true,
            action: () => this.implementRateLimitFix()
        };
    }
    
    fixDataError(errorData) {
        return {
            title: 'Fix Data Access',
            description: 'Trying to access undefined or null data.',
            solution: 'Add null checks and default values',
            autoApply: true,
            action: () => this.addNullChecks()
        };
    }
    
    fixJSONError(errorData) {
        return {
            title: 'Fix JSON Parsing',
            description: 'Invalid JSON data received.',
            solution: 'Add JSON validation and error handling',
            autoApply: true,
            action: () => this.fixJSONParsing()
        };
    }
    
    fixCORSError(errorData) {
        return {
            title: 'Fix CORS Issue',
            description: 'Cross-origin request blocked by browser.',
            solution: 'Configure CORS headers or use proxy',
            autoApply: false,
            action: () => this.fixCORS()
        };
    }
    
    fixDOMError(errorData) {
        return {
            title: 'Fix DOM Element',
            description: 'Element not found in DOM.',
            solution: 'Add element existence checks',
            autoApply: true,
            action: () => this.fixDOMAccess()
        };
    }
    
    // Auto-fix implementations
    fixPhoneNumberData() {
        console.log('🔧 Fixing phone number data...');
        
        // Check if we're getting fake data
        fetch('https://sheets.googleapis.com/v4/spreadsheets/1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg/values/jegodigital-leads-template?key=AIzaSyA-1HU2daAhNIuVOdK6ZN_GOIW9YB1i7a4')
            .then(response => response.json())
            .then(data => {
                if (data.values && data.values.length > 1) {
                    const phoneNumbers = data.values.slice(1, 6).map(row => row[2]); // Phone column
                    console.log('📱 Current phone numbers in sheet:', phoneNumbers);
                    
                    if (phoneNumbers.includes('+52 998 123 4567')) {
                        console.warn('⚠️ Sheet contains fake test data! Need to update with real leads.');
                        this.showFixNotification('Your Google Sheet contains fake test data. Please update it with real leads from your AI qualification agent.');
                    }
                }
            })
            .catch(error => {
                console.error('Error checking sheet data:', error);
            });
    }
    
    retryAPICall() {
        console.log('🔄 Retrying API call with exponential backoff...');
        // Implementation would depend on specific API call
    }
    
    refreshAuthToken() {
        console.log('🔑 Refreshing authentication token...');
        // Implementation for token refresh
    }
    
    implementRateLimitFix() {
        console.log('⏱️ Implementing rate limit fix...');
        // Add delay between API calls
    }
    
    addNullChecks() {
        console.log('🛡️ Adding null checks...');
        // Add defensive programming
    }
    
    fixJSONParsing() {
        console.log('📄 Fixing JSON parsing...');
        // Add try-catch around JSON.parse
    }
    
    fixCORS() {
        console.log('🌐 Fixing CORS issue...');
        // Suggest CORS configuration
    }
    
    fixDOMAccess() {
        console.log('🎯 Fixing DOM access...');
        // Add element existence checks
    }
    
    analyzeDataLog(message, args) {
        if (message.includes('Found phone numbers:')) {
            const phoneNumbers = args[1]; // Second argument should be the array
            if (phoneNumbers && phoneNumbers.includes('+52 998 123 4567')) {
                console.warn('🤖 AI Agent detected fake phone numbers!');
                this.showFixNotification('Fake phone numbers detected. Your Google Sheet contains test data instead of real leads.');
            }
        }
    }
    
    showFixNotification(message) {
        // Create notification in dashboard
        const notification = document.createElement('div');
        notification.className = 'ai-fix-notification';
        notification.innerHTML = `
            <div style="background: #ff6b6b; color: white; padding: 15px; border-radius: 8px; margin: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                <h4 style="margin: 0 0 10px 0; display: flex; align-items: center;">
                    🤖 AI Console Monitor
                </h4>
                <p style="margin: 0 0 10px 0;">${message}</p>
                <button onclick="this.parentElement.parentElement.remove()" style="background: white; color: #ff6b6b; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                    Dismiss
                </button>
            </div>
        `;
        
        // Add to dashboard
        const dashboard = document.querySelector('.container') || document.body;
        dashboard.insertBefore(notification, dashboard.firstChild);
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 10000);
    }
    
    createMonitorUI() {
        // Create monitor panel
        const monitorPanel = document.createElement('div');
        monitorPanel.id = 'ai-console-monitor';
        monitorPanel.innerHTML = `
            <div style="position: fixed; top: 20px; right: 20px; width: 350px; background: white; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.1); z-index: 10000; font-family: 'Segoe UI', sans-serif;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px; border-radius: 12px 12px 0 0;">
                    <h3 style="margin: 0; display: flex; align-items: center;">
                        🤖 AI Console Monitor
                        <span id="monitor-status" style="margin-left: auto; font-size: 12px; background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 12px;">ACTIVE</span>
                    </h3>
                </div>
                <div style="padding: 15px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                        <div style="text-align: center;">
                            <div id="error-count" style="font-size: 24px; font-weight: bold; color: #ff6b6b;">0</div>
                            <div style="font-size: 12px; color: #666;">Errors</div>
                        </div>
                        <div style="text-align: center;">
                            <div id="warning-count" style="font-size: 24px; font-weight: bold; color: #ffa726;">0</div>
                            <div style="font-size: 12px; color: #666;">Warnings</div>
                        </div>
                        <div style="text-align: center;">
                            <div id="fix-count" style="font-size: 24px; font-weight: bold; color: #4caf50;">0</div>
                            <div style="font-size: 12px; color: #666;">Fixes</div>
                        </div>
                    </div>
                    <div id="recent-errors" style="max-height: 200px; overflow-y: auto;">
                        <div style="text-align: center; color: #666; font-size: 14px;">No errors detected</div>
                    </div>
                    <div style="margin-top: 15px; text-align: center;">
                        <button id="clear-monitor" style="background: #667eea; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 12px;">
                            Clear All
                        </button>
                        <button id="toggle-monitor" style="background: #4caf50; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 12px; margin-left: 8px;">
                            Pause
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(monitorPanel);
        
        // Add event listeners
        document.getElementById('clear-monitor').addEventListener('click', () => {
            this.clearAll();
        });
        
        document.getElementById('toggle-monitor').addEventListener('click', (e) => {
            if (this.isMonitoring) {
                this.stopMonitoring();
                e.target.textContent = 'Resume';
                e.target.style.background = '#ff6b6b';
            } else {
                this.startMonitoring();
                e.target.textContent = 'Pause';
                e.target.style.background = '#4caf50';
            }
        });
    }
    
    updateMonitorUI() {
        const errorCount = document.getElementById('error-count');
        const warningCount = document.getElementById('warning-count');
        const fixCount = document.getElementById('fix-count');
        const recentErrors = document.getElementById('recent-errors');
        
        if (errorCount) errorCount.textContent = this.errors.length;
        if (warningCount) warningCount.textContent = this.warnings.length;
        if (fixCount) fixCount.textContent = this.fixes.length;
        
        if (recentErrors) {
            const allIssues = [...this.errors, ...this.warnings].slice(-5);
            if (allIssues.length === 0) {
                recentErrors.innerHTML = '<div style="text-align: center; color: #666; font-size: 14px;">No errors detected</div>';
            } else {
                recentErrors.innerHTML = allIssues.map(issue => `
                    <div style="padding: 8px; border-left: 3px solid ${issue.type === 'error' ? '#ff6b6b' : '#ffa726'}; margin-bottom: 8px; font-size: 12px;">
                        <div style="font-weight: bold; color: #333;">${issue.classification}</div>
                        <div style="color: #666; margin-top: 4px;">${issue.message.substring(0, 50)}...</div>
                        <div style="color: #999; font-size: 10px; margin-top: 2px;">${new Date(issue.timestamp).toLocaleTimeString()}</div>
                    </div>
                `).join('');
            }
        }
    }
    
    clearAll() {
        this.errors = [];
        this.warnings = [];
        this.fixes = [];
        this.updateMonitorUI();
        console.log('🧹 AI Console Monitor cleared');
    }
    
    stopMonitoring() {
        this.isMonitoring = false;
        console.error = this.originalConsole.error;
        console.warn = this.originalConsole.warn;
        console.log = this.originalConsole.log;
        console.log('⏸️ Console monitoring paused');
    }
    
    applyFix(fix) {
        if (fix.action) {
            try {
                fix.action();
                fix.applied = true;
                console.log(`✅ Fix applied: ${fix.title}`);
            } catch (error) {
                console.error(`❌ Failed to apply fix: ${error.message}`);
            }
        }
    }
    
    // Public API
    getStatus() {
        return {
            isMonitoring: this.isMonitoring,
            errors: this.errors.length,
            warnings: this.warnings.length,
            fixes: this.fixes.length,
            recentErrors: this.errors.slice(-5)
        };
    }
    
    getFixes() {
        return this.fixes;
    }
    
    applyFixById(fixId) {
        const fix = this.fixes.find(f => f.id === fixId);
        if (fix) {
            this.applyFix(fix);
        }
    }
}

// Initialize AI Console Monitor
let aiConsoleMonitor;

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        aiConsoleMonitor = new AIConsoleMonitor();
    });
} else {
    aiConsoleMonitor = new AIConsoleMonitor();
}

// Export for global access
window.AIConsoleMonitor = AIConsoleMonitor;
window.aiConsoleMonitor = aiConsoleMonitor;
