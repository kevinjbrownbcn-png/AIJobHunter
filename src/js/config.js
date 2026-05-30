import { saveParamState } from './uiManager.js';

export let currentApiKey = "";

// Dedicated production-grade config file parser
export async function getApiKeyFromConfig() {
    try {
        const response = await window.fetch('/config.json');
        if (!response.ok) throw new Error("Could not read root config file properties.");
        const configData = await response.json();
        return configData.gemini_api_key || localStorage.getItem('gemini_api_key') || '';
    } catch (error) {
        console.warn("Config file bypass. Using local storage container fallback:", error);
        return localStorage.getItem('gemini_api_key') || '';
    }
}

export function loadParamState() {
    const cachedKey = localStorage.getItem('gemini_api_key') || '';
    const cachedGDrive = localStorage.getItem('gdrive_webhook') || '';
    const cachedExport = localStorage.getItem('export_webhook') || '';
    
    currentApiKey = cachedKey;

    const gdriveInput = document.getElementById('gdrive_webhook');
    const exportInput = document.getElementById('export_webhook');
    
    if (gdriveInput) gdriveInput.value = cachedGDrive;
    if (exportInput) exportInput.value = cachedExport;

    const saveBtn = document.getElementById('save-sync-routes-btn');
    if (saveBtn) {
        saveBtn.onclick = function() {
            const newGDrive = document.getElementById('gdrive_webhook').value.trim();
            const newExport = document.getElementById('export_webhook').value.trim();
            
            localStorage.setItem('gdrive_webhook', newGDrive);
            localStorage.setItem('export_webhook', newExport);
            window.showAlert('Route Configured', 'All Webhook pipeline routing configurations saved successfully.', 'success');
        };
    }

    let savedState = localStorage.getItem('job_hunter_param_state') || localStorage.getItem('global_shared_hunter_param_state');
    
    if (!savedState) {
        document.getElementById('role-pm').checked = false;
        document.getElementById('role-srpm').checked = true;
        document.getElementById('role-prog').checked = true;
        document.getElementById('role-eng').checked = true;
        document.getElementById('role-spec').checked = true;
        
        attachChangeListeners();
        return;
    }

    try {
        const state = JSON.parse(savedState);
        const listContainer = document.getElementById('roles-checkbox-list');

        state.roles.forEach(role => {
            let checkbox = document.getElementById(role.id);
            
            if (!checkbox && role.isCustom) {
                const newLabel = document.createElement('label');
                newLabel.className = "checkbox-row";
                newLabel.innerHTML = `
                    <input type="checkbox" id="${role.id}" value="${role.value}">
                    <span>${role.value}</span>
                `;
                listContainer.appendChild(newLabel);
                checkbox = document.getElementById(role.id);
            }
            if (checkbox) checkbox.checked = role.checked;
        });

        if (state.location) document.getElementById('search-location').value = state.location;
        if (state.time) document.getElementById('search-time').value = state.time;
        if (state.focus) document.getElementById('search-focus').value = state.focus;
    } catch (e) {
        console.warn("State synchronization bypassed safely.");
    }

    attachChangeListeners();
}

function attachChangeListeners() {
    document.querySelectorAll('#roles-checkbox-list input[type="checkbox"]').forEach(el => {
        el.onchange = saveParamState;
    });
    const loc = document.getElementById('search-location');
    const tm = document.getElementById('search-time');
    const foc = document.getElementById('search-focus');
    
    if (loc) loc.oninput = saveParamState;
    if (tm) tm.onchange = saveParamState;
    if (foc) foc.oninput = saveParamState;
}

export async function fetchBaseCVText(hookUrl, loadingState) {
    document.getElementById('loader-title').textContent = "Accessing Google Drive...";
    document.getElementById('loader-desc').textContent = "Downloading your base resume mapping file securely via Make.com router.";
    loadingState.classList.remove('hidden');

    const gdriveResponse = await window.fetch(hookUrl, { method: 'POST' });
    if (!gdriveResponse.ok) throw new Error("Could not pull file text from Drive Webhook.");
    return await gdriveResponse.text();
}
