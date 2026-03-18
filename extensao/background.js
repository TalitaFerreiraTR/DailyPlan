chrome.action.onClicked.addListener(function() {
    chrome.tabs.query({ url: 'https://talitaferreiratr.github.io/DailyPlan/*' }, function(tabs) {
        if (tabs.length > 0) {
            chrome.tabs.update(tabs[0].id, { active: true });
        } else {
            chrome.tabs.create({ url: 'https://talitaferreiratr.github.io/DailyPlan/' });
        }
    });
});

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if (msg && msg.action === 'DP_SCRAPE_SS_TAB') {
        var ssNumero = msg.ssNumero || '';
        chrome.tabs.query({ url: '*://sgd.dominiosistemas.com.br/sgsa/faces/ss.html*' }, function(tabs) {
            if (!tabs || tabs.length === 0) {
                sendResponse({ error: 'Nenhuma aba com SS encontrada. Abra a SS no navegador e tente novamente.' });
                return;
            }
            var tab = null;
            if (ssNumero) {
                var re = new RegExp('[?&]ss=' + ssNumero + '(?:&|$)');
                for (var i = 0; i < tabs.length; i++) {
                    if (re.test(tabs[i].url || '')) { tab = tabs[i]; break; }
                }
            }
            if (!tab) tab = tabs[0];
            chrome.tabs.sendMessage(tab.id, { action: 'SCRAPE_SS' }, function(response) {
                if (chrome.runtime.lastError) {
                    sendResponse({ error: 'Não foi possível ler a aba. Recarregue a página da SS (F5) e tente de novo.' });
                    return;
                }
                if (response && response.html) {
                    sendResponse({ html: response.html });
                } else {
                    sendResponse({ error: 'Resposta inválida da aba. Recarregue a página da SS e tente novamente.' });
                }
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
