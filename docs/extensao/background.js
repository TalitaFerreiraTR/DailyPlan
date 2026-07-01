function scoreSsHtml(html) {
    if (!html || typeof html !== 'string') return -1;
    var s = 0;
    if (html.indexOf('tableVisualizacaoField') !== -1) s += 20;
    if (html.indexOf('tableVisualizacaoDestaque') !== -1) s += 20;
    if (html.indexOf('tableVisualizacaoHtml') !== -1) s += 20;
    if (/Número:\s*\d+/.test(html)) s += 10;
    if (html.indexOf('Assunto:') !== -1) s += 8;
    if (html.indexOf('Descreva de forma detalhada') !== -1) s += 8;
    if (html.indexOf('Passos para reproduzir') !== -1) s += 8;
    if (/tramite\d+/i.test(html) || html.indexOf('TRÂMITES') !== -1) s += 5;
    return s;
}

function pickBestHtmlFromFrameResults(results) {
    if (!results || !results.length) return '';
    var best = '';
    var bestScore = -1;
    for (var i = 0; i < results.length; i++) {
        var inj = results[i];
        if (inj.error) continue;
        var r = inj.result;
        if (!r || typeof r.html !== 'string') continue;
        var h = r.html;
        if (!h.length) continue;
        var sc = scoreSsHtml(h);
        if (sc > bestScore || (sc === bestScore && h.length > best.length)) {
            bestScore = sc;
            best = h;
        }
    }
    return best;
}

function scrapeSsHtmlAllFrames(tabId, callback) {
    chrome.scripting.executeScript({
        target: { tabId: tabId, allFrames: true },
        func: function() {
            try {
                return { html: document.documentElement ? document.documentElement.outerHTML : '' };
            } catch (e) {
                return { html: '' };
            }
        }
    }, function(results) {
        if (chrome.runtime.lastError) {
            callback('', chrome.runtime.lastError.message);
            return;
        }
        callback(pickBestHtmlFromFrameResults(results), null);
    });
}

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
            scrapeSsHtmlAllFrames(tab.id, function(fromFrames, err) {
                var okFrames = fromFrames && scoreSsHtml(fromFrames) >= 10;
                if (okFrames) {
                    sendResponse({ html: fromFrames });
                    return;
                }
                chrome.tabs.sendMessage(tab.id, { action: 'SCRAPE_SS' }, function(response) {
                    if (chrome.runtime.lastError) {
                        if (fromFrames && fromFrames.length > 100) {
                            sendResponse({ html: fromFrames });
                            return;
                        }
                        sendResponse({ error: 'Não foi possível ler a aba. Recarregue a página da SS (F5) e tente de novo.' });
                        return;
                    }
                    var hMsg = response && response.html;
                    if (hMsg && scoreSsHtml(hMsg) >= (fromFrames ? scoreSsHtml(fromFrames) : 0)) {
                        sendResponse({ html: hMsg });
                    } else if (fromFrames && fromFrames.length > 100) {
                        sendResponse({ html: fromFrames });
                    } else if (hMsg) {
                        sendResponse({ html: hMsg });
                    } else {
                        sendResponse({ error: (response && response.error) ? response.error : 'Resposta inválida da aba. Recarregue a página da SS e tente novamente.' });
                    }
                });
            });
        });
        return true;
    }

    if (msg.action === 'DP_CAPTURE_SS_HTML') {
        var capTabId = sender.tab && sender.tab.id;
        if (!capTabId) {
            sendResponse({ error: 'Aba não identificada. Recarregue a página da SS.' });
            return true;
        }
        scrapeSsHtmlAllFrames(capTabId, function(fromFrames, err) {
            if (fromFrames && scoreSsHtml(fromFrames) >= 10) {
                sendResponse({ html: fromFrames });
                return;
            }
            chrome.tabs.sendMessage(capTabId, { action: 'SCRAPE_SS' }, function(response) {
                var hMsg = response && response.html;
                if (hMsg && scoreSsHtml(hMsg) >= (fromFrames ? scoreSsHtml(fromFrames) : 0)) {
                    sendResponse({ html: hMsg });
                } else if (fromFrames && fromFrames.length > 100) {
                    sendResponse({ html: fromFrames });
                } else if (hMsg) {
                    sendResponse({ html: hMsg });
                } else {
                    sendResponse({ error: err || 'Não foi possível obter o HTML da SS.' });
                }
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
