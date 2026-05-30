import { fetchBaseCVText } from './config.js';
import { renderJobCards, updateSelectedCounter } from './uiManager.js';

export async function scanWebForJobs() {
    const hookUrl = localStorage.getItem('gdrive_webhook');
    if (!hookUrl) {
        window.showAlert('Setup Missing', 'Please verify your Make fetch connection hook settings inside Tab 3.', 'error');
        return;
    }

    const checkedRoles = Array.from(document.querySelectorAll('#roles-checkbox-list input[type="checkbox"]:checked')).map(cb => cb.value);
    if (checkedRoles.length === 0) {
        window.showAlert('Error', 'Select at least one position type checkbox.', 'error');
        return;
    }

    const loadingState = document.getElementById('loading-state');
    const resultsContainer = document.getElementById('results-container');
    const bulkPanel = document.getElementById('bulk-controls-panel');
    
    document.getElementById('empty-state').classList.add('hidden');
    resultsContainer.classList.add('hidden');
    bulkPanel.classList.add('hidden');
    
    let baseCVText = "";
    try {
        // Force window context mapping for background webhooks too
        baseCVText = await fetchBaseCVText(hookUrl, loadingState);
    } catch (err) {
        loadingState.classList.add('hidden');
        document.getElementById('empty-state').classList.remove('hidden');
        window.showAlert('Drive Sync Failed', err.message, 'error');
        return;
    }

    document.getElementById('loader-title').textContent = "Harvesting Open Web Postings...";
    document.getElementById('loader-desc').textContent = "Analyzing job markets, ranking criteria matches, and checking framework skill gaps.";

    const location = document.getElementById('search-location').value;
    const timeWindow = document.getElementById('search-time').value;
    const focusKeywords = document.getElementById('search-focus').value;

    const searchPrompt = `Search the live web for real, active job postings matching these criteria:
Roles: ${checkedRoles.join(', ')}
Locations: ${location}
Recency: Published in ${timeWindow}
Industry/Focus: ${focusKeywords}

Evaluate every job you discover against this Candidate Base CV retrieved from Google Drive:
---
${baseCVText}
---

CRITICAL STRUCTURAL OUTPUT INSTRUCTIONS:
You MUST respond with a valid, raw JSON array of objects matching the schema below. 
DO NOT write any markdown syntax wrapping, do not use backticks (\`\`\`), and do not use any introductory or conversational text. If no jobs are discovered, return an empty array [] zero exceptions.

Schema Layout Expected:
[
  {
    "job_title": "String",
    "company": "String",
    "location": "String",
    "link": "String - Deep link direct role webpage URL",
    "summary": "String - A highly concise 3-4 sentence high-level responsibility summary for the UI card",
    "description": "String - Extract the COMPLETE, RAW, UNABRIDGED job description text in full verbatim.",
    "match_score": Number,
    "skills_gaps": ["String"],
    "resources": ["String"]
  }
]`;

    let rawJSONText = "";
    try {
        const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;
        
        // CRITICAL FIX: Explicitly call window.fetch to invoke the Python proxy key-injector script
        const apiResponse = await window.fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: searchPrompt }] }],
                tools: [{ google_search: {} }]
            })
        });

        if (!apiResponse.ok) {
            const errData = await apiResponse.json();
            if (window.pywebview && window.pywebview.api) {
                await window.pywebview.api.write_error_log("Scanner_API_Rejection", `HTTP_Status_${apiResponse.status}`, JSON.stringify(errData, null, 2));
            }
            throw new Error(errData.error?.message || `Gemini gateway rejected search request with status code ${apiResponse.status}`);
        }
        
        const resData = await apiResponse.json();
        rawJSONText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!rawJSONText) {
            if (window.pywebview && window.pywebview.api) {
                await window.pywebview.api.write_error_log("Scanner_Empty_Payload", "No_Text_Returned", JSON.stringify(resData, null, 2));
            }
            throw new Error("No text content returned from the AI search engine.");
        }
        
        rawJSONText = rawJSONText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        
        if (!rawJSONText.startsWith('[') && !rawJSONText.startsWith('{')) {
            throw new Error(rawJSONText);
        }
        const jobs = JSON.parse(rawJSONText);

        renderJobCards(jobs);
        loadingState.classList.add('hidden');
        resultsContainer.classList.remove('hidden');
        
        if (jobs.length > 0) {
            bulkPanel.classList.remove('hidden');
            updateSelectedCounter();
        }
        window.showAlert('Scan Completed', `Successfully found and analyzed ${jobs.length} roles!`, 'success');
    } catch (error) {
        loadingState.classList.add('hidden');
        document.getElementById('empty-state').classList.remove('hidden');
        
        if (window.pywebview && window.pywebview.api) {
            const debugPayload = {
                errorMessage: error.message,
                recoveredRawText: rawJSONText,
                targetParams: { location, timeWindow, focusKeywords, checkedRoles }
            };
            await window.pywebview.api.write_error_log("Scanner_Execution_Fault", error.name || "Exception", JSON.stringify(debugPayload, null, 2));
        }
        
        window.showAlert('Web Scraper Engine Interrupted', `${error.message}. A technical trace log check has been saved to /logs.`, 'error');
    }
}