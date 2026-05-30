// Shared application-wide runtime variables
let selectedJobsIndices = new Set();

export function updateSelectedCounter() {
    const totalCards = document.querySelectorAll('.job-card').length;
    const checkedCards = document.querySelectorAll('.job-card-checkbox:checked').length;
    
    const counterText = document.getElementById('selected-counter-text');
    if (counterText) {
        counterText.textContent = `${checkedCards} of ${totalCards} selected`;
    }
}

export function toggleSelectAll(masterCheckbox) {
    const checkboxes = document.querySelectorAll('.job-card-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = masterCheckbox.checked;
        const card = cb.closest('.job-card');
        if (card) {
            if (masterCheckbox.checked) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        }
    });
    updateSelectedCounter();
}

export function addCustomRoleOption() {
    const inputEl = document.getElementById('custom-role-input');
    if (!inputEl) return;
    
    const val = inputEl.value.trim();
    if (!val) return;

    const listContainer = document.getElementById('roles-checkbox-list');
    const customId = `custom-role-${Date.now()}`;

    const newLabel = document.createElement('label');
    newLabel.className = "checkbox-row";
    newLabel.innerHTML = `
        <input type="checkbox" id="${customId}" value="${val}" checked>
        <span>${val}</span>
    `;
    
    listContainer.appendChild(newLabel);
    inputEl.value = "";
    
    // Safely trigger backup configuration saves natively
    const changeEvent = new Event('change');
    newLabel.querySelector('input').dispatchEvent(changeEvent);
    
    window.showAlert('Custom Role Added', `"${val}" has been added to your discovery checklist.`, 'success');
}

export function saveParamState() {
    const roleCheckboxes = document.querySelectorAll('#roles-checkbox-list input[type="checkbox"]');
    const rolesData = Array.from(roleCheckboxes).map(cb => ({
        id: cb.id,
        value: cb.value,
        checked: cb.checked,
        isCustom: cb.id.startsWith('custom-role-')
    }));

    const statePayload = {
        roles: rolesData,
        location: document.getElementById('search-location')?.value || '',
        time: document.getElementById('search-time')?.value || 'the last 7 days',
        focus: document.getElementById('search-focus')?.value || ''
    };

    localStorage.setItem('job_hunter_param_state', JSON.stringify(statePayload));
    localStorage.setItem('global_shared_hunter_param_state', JSON.stringify(statePayload));
}

export function renderJobCards(jobs) {
    const listContainer = document.getElementById('jobs-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = "";
    window.currentJobsList = jobs; 
    
    const countBadge = document.getElementById('results-count');
    if (countBadge) countBadge.textContent = `${jobs.length} Roles Discovered`;

    if (!jobs || jobs.length === 0) {
        document.getElementById('results-container').classList.add('hidden');
        document.getElementById('bulk-controls-panel').classList.add('hidden');
        document.getElementById('empty-state').classList.remove('hidden');
        return;
    }

    jobs.forEach((job, index) => {
        const card = document.createElement('div');
        card.className = "job-card";
        
        // Dynamically compute score badge coloring
        let scoreColor = "#64748b";
        if (job.match_score >= 85) scoreColor = "#10b981";
        else if (job.match_score >= 70) scoreColor = "#eab308";
        else if (job.match_score > 0) scoreColor = "#ef4444";

        const skillGapsHTML = Array.isArray(job.skills_gaps) && job.skills_gaps.length > 0
            ? job.skills_gaps.map(g => `<span class="badge-gap">${g}</span>`).join('')
            : `<span style="color: #10b981; font-size: 12px; font-weight: bold;">✓ Perfect Toolkit Alignment</span>`;

        card.innerHTML = `
            <div class="card-left-select">
                <input type="checkbox" class="job-card-checkbox" data-index="${index}" onchange="this.closest('.job-card').classList.toggle('selected', this.checked); window.updateSelectedCounter();">
            </div>
            <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                    <div>
                        <h4 class="card-title">${job.job_title || 'Inferred Position'}</h4>
                        <p class="card-subtitle">${job.company || 'Unknown Studio'} — <span style="color: #94a3b8;">${job.location || 'Manual Text Audit'}</span></p>
                    </div>
                    <div class="card-score-badge" style="background-color: ${scoreColor};">${job.match_score || 0}% Match</div>
                </div>
                
                <p class="card-summary">${job.summary || ''}</p>
                
                <div class="gap-section">
                    <div class="gap-title">Skill Gaps Identified</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">${skillGapsHTML}</div>
                </div>

                ${job.link && job.link !== "Pasted Text Manual Audit" ? `<a href="${job.link}" target="_blank" class="card-link-anchor">Open Original Job Posting Website ↗</a>` : ''}
            </div>
        `;
        listContainer.appendChild(card);
    });
}

export function addToHistoryLog(title, company, link, location, score) {
    let history = [];
    try {
        history = JSON.parse(localStorage.getItem('job_hunter_audit_ledger') || '[]');
    } catch(e) { history = []; }

    history.unshift({
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        title: title,
        company: company,
        link: link,
        location: location,
        score: score
    });

    localStorage.setItem('job_hunter_audit_ledger', JSON.stringify(history.slice(0, 50)));
}

export function renderHistoryLogTable() {
    const tbody = document.getElementById('history-log-tbody');
    const emptyState = document.getElementById('history-empty-state');
    if (!tbody) return;

    let history = [];
    try {
        history = JSON.parse(localStorage.getItem('job_hunter_audit_ledger') || '[]');
    } catch(e) { history = []; }

    tbody.innerHTML = "";
    
    if (history.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    history.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="color: #64748b; font-size: 11px;">${item.timestamp}</td>
            <td style="font-weight: 600; color: #f8fafc;">${item.title}</td>
            <td style="color: #cbd5e1;">${item.company}</td>
            <td style="color: #94a3b8; font-size: 12px;">${item.location}</td>
            <td style="text-align: center;"><span style="color: #2dd4bf; font-weight: bold;">${item.score}%</span></td>
            <td style="text-align: right;">
                ${item.link && item.link.startsWith('http') ? `<a href="${item.link}" target="_blank" style="color: #38bdf8; text-decoration: none; font-size: 11px;">View Posting ↗</a>` : `<span style="color: #475569; font-size: 11px;">No Link</span>`}
            </td>
        `;
        tbody.appendChild(row);
    });
}

export function clearHistoryLog() {
    localStorage.removeItem('job_hunter_audit_ledger');
    renderHistoryLogTable();
    window.showAlert('Ledger Cleared', 'All local historical spreadsheet logging arrays wiped clean.', 'success');
}

// System Toast Alerts Engine
window.showAlert = function(title, text, type = 'success') {
    const wrapper = document.getElementById('toast-wrapper-container');
    if (!wrapper) return;

    const toast = document.createElement('div');
    toast.className = `toast-box toast-${type}`;
    
    let icon = "✓";
    if (type === 'error') icon = "✕";
    if (type === 'warning') icon = "⚠";

    toast.innerHTML = `
        <div class="toast-icon-frame">${icon}</div>
        <div style="flex-grow:1;">
            <div class="toast-title-text">${title}</div>
            <div class="toast-desc-text">${text}</div>
        </div>
    `;

    wrapper.appendChild(toast);
    setTimeout(() => { toast.classList.add('toast-show'); }, 10);

    setTimeout(() => {
        toast.classList.remove('toast-show');
        setTimeout(() => { toast.remove(); }, 300);
    }, 4000);
};