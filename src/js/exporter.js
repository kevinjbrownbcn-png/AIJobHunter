import { addToHistoryLog } from './uiManager.js';

export async function exportBatchSelected(btnElement) {
    const exportHookUrl = localStorage.getItem('export_webhook');
    if (!exportHookUrl) {
        window.showAlert('Sync Configuration Missing', 'Please paste your Spreadsheet Writer Webhook URL inside the settings panel tab.', 'error');
        return;
    }

    const selectedCheckboxes = document.querySelectorAll('.job-card-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        window.showAlert('Selection Empty', 'Please check at least one role card checkbox to export data.', 'error');
        return;
    }

    const masterJobsCache = window.currentJobsList || [];
    const executionPayloads = [];
    let skippedCounter = 0;

    selectedCheckboxes.forEach(cb => {
        const targetIndex = parseInt(cb.getAttribute('data-index'), 10);
        const jobData = masterJobsCache[targetIndex];
        
        if (jobData) {
            const checkedTitle = (jobData.job_title || "").trim();
            const checkedCompany = (jobData.company || "").trim();
            const checkedLink = (jobData.link || "").trim();

            if (checkedTitle === "" || checkedCompany === "" || checkedLink === "") {
                skippedCounter++;
                return; 
            }

            executionPayloads.push({
                // INJECT TARGET PROFILE TRACK CAPTURES AS FIRST ROW VALUE SCHEMAS
                profile: jobData.profile || "Localization",
                job_title: checkedTitle,
                company: checkedCompany,
                link: checkedLink,
                description: jobData.description || "",
                match_score: jobData.match_score || 0,
                skills_gaps: Array.isArray(jobData.skills_gaps) ? jobData.skills_gaps.join(', ') : (jobData.skills_gaps || ""),
                resources: Array.isArray(jobData.resources) ? jobData.resources.join(', ') : (jobData.resources || ""),
                status: "Draft"
            });
        }
    });

    if (executionPayloads.length === 0) {
        window.showAlert(
            'Export Filtered / Blocked', 
            `All ${skippedCounter} selected roles were blocked from saving. Tracking rows require an explicit Title, Company, and source URL link before they can be committed to Google Sheets.`, 
            'error'
        );
        return;
    }

    const originalContent = btnElement.innerHTML;
    btnElement.disabled = true;
    btnElement.style.opacity = "0.6";
    btnElement.innerHTML = `<span>⏳</span> Syncing ${executionPayloads.length} Rows...`;

    let completedDispatches = 0;
    let failedDispatches = 0;

    for (const payload of executionPayloads) {
        try {
            const apiResponse = await window.fetch(exportHookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (apiResponse.ok) {
                completedDispatches++;
                addToHistoryLog(payload.job_title, payload.company, payload.link, payload.profile, payload.match_score);
                
                const matchedCheckbox = Array.from(selectedCheckboxes).find(cb => {
                    const idx = parseInt(cb.getAttribute('data-index'), 10);
                    return masterJobsCache[idx] && masterJobsCache[idx].job_title === payload.job_title && masterJobsCache[idx].company === payload.company;
                });
                if (matchedCheckbox) {
                    matchedCheckbox.checked = false;
                    const cardWrapper = matchedCheckbox.closest('.job-card');
                    if (cardWrapper) {
                        cardWrapper.style.opacity = "0.4";
                        cardWrapper.style.borderLeft = "4px solid #64748b";
                    }
                }
            } else {
                failedDispatches++;
            }
        } catch (error) {
            console.error("Dispatched row packet rejected by gateway:", error);
            failedDispatches++;
        }
    }

    btnElement.disabled = false;
    btnElement.style.opacity = "1";
    btnElement.innerHTML = originalContent;

    const masterSelect = document.getElementById('master-select-checkbox');
    if (masterSelect) masterSelect.checked = false;
    
    let skipNoticeMessage = "";
    if (skippedCounter > 0) {
        skipNoticeMessage = ` (${skippedCounter} card entries were skipped due to missing Title/Company/URL configurations)`;
    }

    if (failedDispatches === 0) {
        window.showAlert('Export Succeeded', `Successfully exported ${completedDispatches} positions to your tracking sheet!${skipNoticeMessage}`, 'success');
    } else if (completedDispatches > 0) {
        window.showAlert('Partial Sync Warning', `Successfully synchronized ${completedDispatches} rows, but ${failedDispatches} attempts were rejected by the webhook gate.${skipNoticeMessage}`, 'error');
    } else {
        window.showAlert('Network Transfer Failure', `Spreadsheet writer gateway rejected all transmission packet frames.${skipNoticeMessage}`, 'error');
    }
}