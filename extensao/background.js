chrome.action.onClicked.addListener(function() {
    chrome.tabs.query({ url: 'https://talitaferreiratr.github.io/DailyPlan/*' }, function(tabs) {
        if (tabs.length > 0) {
            chrome.tabs.update(tabs[0].id, { active: true });
        } else {
            chrome.tabs.create({ url: 'https://talitaferreiratr.github.io/DailyPlan/' });
        }
    });
});

function findPSAITab(psaiCode, callback) {
    chrome.tabs.query({ url: '*://sgd.dominiosistemas.com.br/sgsa/faces/psai.html*' }, function(tabs) {
        if (!tabs || tabs.length === 0) { callback(null); return; }
        var tab = null;
        if (psaiCode) {
            var re = new RegExp('[?&]psai=' + psaiCode + '(?:&|$)');
            for (var i = 0; i < tabs.length; i++) {
                if (re.test(tabs[i].url || '')) { tab = tabs[i]; break; }
            }
        }
        callback(tab || tabs[0]);
    });
}

function findSSTab(ssNumero, callback) {
    chrome.tabs.query({ url: '*://sgd.dominiosistemas.com.br/sgsa/faces/ss.html*' }, function(tabs) {
        if (!tabs || tabs.length === 0) { callback(null); return; }
        var tab = null;
        if (ssNumero) {
            var re = new RegExp('[?&]ss=' + ssNumero + '(?:&|$)');
            for (var i = 0; i < tabs.length; i++) {
                if (re.test(tabs[i].url || '')) { tab = tabs[i]; break; }
            }
        }
        callback(tab || tabs[0]);
    });
}

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if (!msg || !msg.action) return;

    if (msg.action === 'DP_SCRAPE_SS_TAB') {
        findSSTab(msg.ssNumero || '', function(tab) {
            if (!tab) { sendResponse({ error: 'Nenhuma aba com SS encontrada. Abra a SS no navegador e tente novamente.' }); return; }
            chrome.tabs.sendMessage(tab.id, { action: 'SCRAPE_SS' }, function(response) {
                if (chrome.runtime.lastError) { sendResponse({ error: 'Não foi possível ler a aba. Recarregue a página da SS (F5) e tente de novo.' }); return; }
                sendResponse(response && response.html ? { html: response.html } : { error: 'Resposta inválida da aba. Recarregue a página da SS e tente novamente.' });
            });
        });
        return true;
    }

    if (msg.action === 'DP_WRITE_SS_NOTE') {
        findSSTab(msg.ssNumero || '', function(tab) {
            if (!tab) { sendResponse({ ok: false, error: 'Nenhuma aba com SS encontrada. Abra a SS no navegador e tente novamente.' }); return; }
            chrome.tabs.sendMessage(tab.id, { action: 'WRITE_SS_NOTE', text: msg.text || '', autoSubmit: msg.autoSubmit !== false }, function(response) {
                if (chrome.runtime.lastError) { sendResponse({ ok: false, error: 'Não foi possível acessar a aba da SS. Recarregue a página (F5) e tente de novo.' }); return; }
                sendResponse(response || { ok: false, error: 'Sem resposta do content script.' });
            });
        });
        return true;
    }

    if (msg.action === 'DP_DISCOVER_SS_FORM') {
        findSSTab(msg.ssNumero || '', function(tab) {
            if (!tab) { sendResponse({ error: 'Nenhuma aba com SS encontrada.' }); return; }
            chrome.tabs.sendMessage(tab.id, { action: 'DISCOVER_SS_FORM' }, function(response) {
                if (chrome.runtime.lastError) { sendResponse({ error: 'Não foi possível acessar a aba da SS.' }); return; }
                sendResponse(response || { error: 'Sem resposta.' });
            });
        });
        return true;
    }

    if (msg.action === 'DP_WRITE_PSAI_NOTE') {
        findPSAITab(msg.psaiCode || '', function(tab) {
            if (!tab) { sendResponse({ ok: false, error: 'Nenhuma aba com PSAI encontrada. Abra a PSAI no navegador e tente novamente.' }); return; }
            chrome.tabs.sendMessage(tab.id, { action: 'WRITE_PSAI_NOTE', text: msg.text || '', autoSubmit: msg.autoSubmit !== false }, function(response) {
                if (chrome.runtime.lastError) { sendResponse({ ok: false, error: 'Não foi possível acessar a aba da PSAI. Recarregue a página (F5) e tente de novo.' }); return; }
                sendResponse(response || { ok: false, error: 'Sem resposta do content script.' });
            });
        });
        return true;
    }

    if (msg.action === 'DP_DISCOVER_PSAI_FORM') {
        findPSAITab(msg.psaiCode || '', function(tab) {
            if (!tab) { sendResponse({ error: 'Nenhuma aba com PSAI encontrada.' }); return; }
            chrome.tabs.sendMessage(tab.id, { action: 'DISCOVER_PSAI_FORM' }, function(response) {
                if (chrome.runtime.lastError) { sendResponse({ error: 'Não foi possível acessar a aba da PSAI.' }); return; }
                sendResponse(response || { error: 'Sem resposta.' });
            });
        });
        return true;
    }
});

chrome.storage.onChanged.addListener(function(changes, area) {
    if (area !== 'local') return;
    var keys = ['myCasesV14', 'generalNotesList', 'myGroupsV1'];
    var hasRelevant = keys.some(function(k) { return !!changes[k]; });
    if (!hasRelevant) return;
    chrome.tabs.query({ url: 'https://talitaferreiratr.github.io/DailyPlan/*' }, function(tabs) {
        tabs.forEach(function(tab) {
            chrome.tabs.sendMessage(tab.id, { action: 'DP_SYNC_FROM_EXT' }).catch(function() {});
        });
    });
});
