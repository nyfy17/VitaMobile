// app.js - Main PWA logic with correct field names
class VitaMobileReview {
    constructor() {
        this.db = null;
        this.emails = [];
        this.currentIndex = 0;
        this.corrections = [];
        this.projects = [];
        
        this.initializeApp();
    }
    
    async initializeApp() {
        // Initialize SQL.js
        this.SQL = await initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });
        
        // Set up event listeners
        document.getElementById('db-file').addEventListener('change', (e) => this.loadDatabase(e));
        document.getElementById('export-corrections').addEventListener('click', () => this.exportCorrections());
        
        // Register service worker for offline capability
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('service_worker.js');
        }
        
        // Load saved state if exists
        this.loadSavedState();
    }
    
    async loadDatabase(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        try {
            // Load database
            this.db = new this.SQL.Database(uint8Array);
            
            // Load emails - using the correct column names
            const result = this.db.exec(`
                SELECT * FROM review_queue 
                ORDER BY category_confidence ASC, project_confidence ASC
            `);
            
            if (result.length > 0) {
                this.emails = this.parseQueryResult(result[0]);
                
                // Load projects
                const projectResult = this.db.exec("SELECT name FROM projects ORDER BY name");
                if (projectResult.length > 0) {
                    this.projects = projectResult[0].values.map(row => row[0]);
                }
                
                // Update UI
                this.updateStats();
                this.showEmail(0);
                
                // Show export button
                document.getElementById('export-corrections').style.display = 'block';
                
                // Save to IndexedDB for persistence
                this.saveToIndexedDB(uint8Array);
            } else {
                alert('No emails found in database');
            }
        } catch (error) {
            console.error('Database loading error:', error);
            alert('Error loading database: ' + error.message);
        }
    }
    
    parseQueryResult(result) {
        const columns = result.columns;
        const values = result.values;
        
        return values.map(row => {
            const obj = {};
            columns.forEach((col, index) => {
                obj[col] = row[index];
            });
            return obj;
        });
    }
    
    showEmail(index) {
        if (index >= this.emails.length) {
            this.showComplete();
            return;
        }
        
        this.currentIndex = index;
        const email = this.emails[index];
        
        // Get sender display name
        const senderDisplay = email.sender_name && email.sender_name !== 'DELETED' 
            ? email.sender_name 
            : (email.sender || 'Unknown Sender');
        
        const html = `
            <div class="email-card">
                <div class="email-header">
                    <div class="subject">${email.subject}</div>
                    <div class="sender">From: ${senderDisplay}</div>
                    <div class="sender">Date: ${new Date(email.received_date || email.sent_date).toLocaleDateString()}</div>
                </div>
                
                ${email.oneline_summary ? `
                <div style="background: #e3f2fd; padding: 10px; border-radius: 4px; margin: 10px 0;">
                    <strong>Summary:</strong> ${email.oneline_summary}
                </div>
                ` : ''}
                
                <div class="analysis">
                    <h4>Current AI Analysis</h4>
                    <p><strong>Category:</strong> ${email.ai_category || 'Not analyzed'} 
                       <span class="confidence ${this.getConfidenceClass(email.category_confidence || 0)}">
                           ${Math.round(email.category_confidence || 0)}% confident
                       </span>
                    </p>
                    <p><em>Reasoning:</em> ${email.category_reasoning || 'None provided'}</p>
                    
                    <p style="margin-top: 10px;"><strong>Project:</strong> ${email.ai_project || email.project || 'None'} 
                       <span class="confidence ${this.getConfidenceClass(email.project_confidence || 0)}">
                           ${Math.round(email.project_confidence || 0)}% confident
                       </span>
                    </p>
                    <p><em>Clues:</em> ${email.project_clues || 'None provided'}</p>
                </div>
                
                <div>
                    <span class="toggle-thread" onclick="vitaApp.toggleThread()">
                        📧 Show Full Email
                    </span>
                    <div id="thread-content" class="thread-content" style="display:none;">
                        ${email.body || email.full_thread || 'No email content'}
                    </div>
                </div>
                
                <div class="correction-section">
                    <h4>Your Corrections</h4>
                    
                    <div class="field-group">
                        <label>Category:</label>
                        <select id="correct-category">
                            <option value="">(Keep: ${email.ai_category || 'Not analyzed'})</option>
                            ${this.getCategoryOptions()}
                        </select>
                        <textarea id="category-reason" 
                                  placeholder="Why this category? (optional)"></textarea>
                    </div>
                    
                    <div class="field-group">
                        <label>Project:</label>
                        <select id="correct-project">
                            <option value="">(Keep: ${email.ai_project || email.project || 'None'})</option>
                            ${this.getProjectOptions()}
                        </select>
                        <textarea id="project-reason" 
                                  placeholder="Why this project? (optional)"></textarea>
                    </div>
                </div>
                
                <div class="button-group">
                    <button class="btn-success" onclick="vitaApp.approveAndNext()">
                        ✓ Approve AI
                    </button>
                    <button class="btn-primary" onclick="vitaApp.saveAndNext()">
                        💾 Save Corrections
                    </button>
                    <button class="btn-secondary" onclick="vitaApp.skipEmail()">
                        ⏭ Skip
                    </button>
                </div>
                
                <div style="text-align: center; margin-top: 10px; color: #666;">
                    Email ${index + 1} of ${this.emails.length}
                </div>
            </div>
        `;
        
        document.getElementById('email-container').innerHTML = html;
    }
    
    getConfidenceClass(confidence) {
        if (confidence < 50) return 'low';
        if (confidence < 80) return 'medium';
        return 'high';
    }
    
    getCategoryOptions() {
        // Correct categories from PACategory enum
        const categories = [
            '1.1 Urgent Reply',
            '1.2 Urgent Task',
            '1.3 Urgent Info',
            '2.1 High Reply',
            '2.2 High Task',
            '2.3 High Info',
            '3.1 Med Reply',
            '3.2 Med Task',
            '3.3 Med Info',
            '4.1 Low Reply',
            '4.2 Delegate',
            '5.1 Archive',
            '5.2 Delete'
        ];
        
        return categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    }
    
    getProjectOptions() {
        if (this.projects.length === 0) {
            return '<option value="General">General</option>';
        }
        
        return this.projects.map(proj => 
            `<option value="${proj}">${proj}</option>`
        ).join('');
    }
    
    toggleThread() {
        const content = document.getElementById('thread-content');
        const isHidden = content.style.display === 'none';
        content.style.display = isHidden ? 'block' : 'none';
        event.target.textContent = isHidden ? '📧 Hide Email' : '📧 Show Full Email';
    }
    
    approveAndNext() {
        // Mark as approved (no corrections needed)
        const email = this.emails[this.currentIndex];
        this.corrections.push({
            email_id: email.id,
            approved: true,
            timestamp: new Date().toISOString()
        });
        
        // Save state
        this.saveState();
        
        // Move to next
        this.showEmail(this.currentIndex + 1);
        this.updateStats();
    }
    
    saveAndNext() {
        const email = this.emails[this.currentIndex];
        
        const correction = {
            email_id: email.id,
            timestamp: new Date().toISOString(),
            approved: false
        };
        
        // Get category correction if changed
        const newCategory = document.getElementById('correct-category').value;
        if (newCategory) {
            correction.category_correction = {
                original: email.ai_category,
                corrected: newCategory,
                user_reasoning: document.getElementById('category-reason').value
            };
        }
        
        // Get project correction if changed
        const newProject = document.getElementById('correct-project').value;
        if (newProject) {
            correction.project_correction = {
                original: email.ai_project || email.project,
                corrected: newProject,
                user_reasoning: document.getElementById('project-reason').value
            };
        }
        
        // Only save if there were actual corrections
        if (correction.category_correction || correction.project_correction) {
            this.corrections.push(correction);
        } else {
            // If no changes, treat as approval
            correction.approved = true;
            this.corrections.push(correction);
        }
        
        // Save state
        this.saveState();
        
        // Move to next
        this.showEmail(this.currentIndex + 1);
        this.updateStats();
    }
    
    skipEmail() {
        // Just move to next without saving anything
        this.showEmail(this.currentIndex + 1);
        this.updateStats();
    }
    
    showComplete() {
        document.getElementById('email-container').innerHTML = `
            <div class="empty-state">
                <h2>Review Complete!</h2>
                <p>You've reviewed all ${this.emails.length} emails</p>
                <p>${this.corrections.length} corrections made</p>
                <br>
                <button class="btn-success" onclick="vitaApp.exportCorrections()" style="padding: 15px 30px;">
                    📤 Export Corrections for Bluetooth
                </button>
            </div>
        `;
    }
    
    exportCorrections() {
        if (this.corrections.length === 0) {
            alert('No corrections to export');
            return;
        }
        
        const exportData = {
            corrections: this.corrections,
            exported_at: new Date().toISOString(),
            email_count: this.emails.length,
            device: 'Vita Mobile PWA'
        };
        
        // Create blob
        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json'
        });
        
        // Create download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vita_corrections_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        // Show instructions
        alert('Corrections saved! Now:\n\n1. Find the file in Downloads\n2. Share via Bluetooth to your desktop\n3. Import in Desktop Vita');
        
        // Clear corrections after export
        this.corrections = [];
        this.saveState();
        this.updateStats();
    }
    
    updateStats() {
        const reviewed = this.corrections.length;
        const total = this.emails.length;
        const remaining = total - this.currentIndex;
        
        document.getElementById('queue-count').textContent = 
            `${remaining} to review | ${reviewed} corrected`;
    }
    
    // IndexedDB for persistence
    async saveToIndexedDB(data) {
        try {
            const db = await this.openDB();
            const tx = db.transaction(['database'], 'readwrite');
            await tx.objectStore('database').put({
                id: 'current',
                data: data,
                timestamp: new Date()
            });
        } catch (error) {
            console.error('Error saving to IndexedDB:', error);
        }
    }
    
    async saveState() {
        localStorage.setItem('vita_corrections', JSON.stringify(this.corrections));
        localStorage.setItem('vita_current_index', this.currentIndex.toString());
    }
    
    async loadSavedState() {
        const saved = localStorage.getItem('vita_corrections');
        if (saved) {
            this.corrections = JSON.parse(saved);
        }
        
        const index = localStorage.getItem('vita_current_index');
        if (index) {
            this.currentIndex = parseInt(index);
        }
        
        // Update stats if we have saved state
        if (this.corrections.length > 0) {
            this.updateStats();
        }
    }
    
    async openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('VitaMobile', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('database')) {
                    db.createObjectStore('database', { keyPath: 'id' });
                }
            };
        });
    }
}

// Initialize app
let vitaApp;
document.addEventListener('DOMContentLoaded', () => {
    vitaApp = new VitaMobileReview();
});

