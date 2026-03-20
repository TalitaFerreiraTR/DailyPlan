(function() {
    var SYNC_KEYS = ['myCasesV14', 'generalNotesList', 'myGroupsV1'];
    var TRUSTED_ORIGIN = window.location.origin;

    function mergeAndNotify() {
        chrome.storage.local.get(SYNC_KEYS, function(extData) {
            var anyAdded = false;
            SYNC_KEYS.forEach(function(key) {
                if (!extData[key]) return;
                var extItems = [];
                try { extItems = JSON.parse(extData[key]); } catch (e) { return; }
                if (!Array.isArray(extItems) || extItems.length === 0) return;

                var localRaw = localStorage.getItem(key);
                var localItems = [];
                try { localItems = JSON.parse(localRaw || '[]'); } catch (e) { localItems = []; }

                var existingIds = {};
                localItems.forEach(function(item) { if (item.id) existingIds[item.id] = true; });

                extItems.forEach(function(item) {
                    if (item.id && !existingIds[item.id]) {
                        localItems.push(item);
                        existingIds[item.id] = true;
                        anyAdded = true;
                    }
                });

                if (anyAdded) localStorage.setItem(key, JSON.stringify(localItems));
            });

            if (anyAdded) {
                window.postMessage({ type: 'DP_EXT_SYNC' }, TRUSTED_ORIGIN);
            }
        });
    }

    window.addEventListener('load', function() { setTimeout(mergeAndNotify, 2000); });

    chrome.runtime.onMessage.addListener(function(msg) {
        if (msg && msg.action === 'DP_SYNC_FROM_EXT') mergeAndNotify();
    });

    window.addEventListener('message', function(event) {
        if (event.source !== window || !event.data) return;
        if (event.data.type === 'DP_REQUEST_SCRAPE_SS') {
            chrome.runtime.sendMessage({ action: 'DP_SCRAPE_SS_TAB', ssNumero: event.data.ssNumero || '' }, function(response) {
                window.postMessage({ type: 'DP_SCRAPE_SS_RESULT', data: response || { error: 'Extensão não respondeu.' } }, TRUSTED_ORIGIN);
            });
        }
        if (event.data.type === 'DP_REQUEST_WRITE_SS') {
            chrome.runtime.sendMessage({ action: 'DP_WRITE_SS_NOTE', ssNumero: event.data.ssNumero || '', text: event.data.text || '', autoSubmit: event.data.autoSubmit !== false }, function(response) {
                window.postMessage({ type: 'DP_WRITE_SS_RESULT', data: response || { ok: false, error: 'Extensão não respondeu.' } }, TRUSTED_ORIGIN);
            });
        }
        if (event.data.type === 'DP_REQUEST_DISCOVER_SS') {
            chrome.runtime.sendMessage({ action: 'DP_DISCOVER_SS_FORM', ssNumero: event.data.ssNumero || '' }, function(response) {
                window.postMessage({ type: 'DP_DISCOVER_SS_RESULT', data: response || { error: 'Extensão não respondeu.' } }, TRUSTED_ORIGIN);
            });
        }
        if (event.data.type === 'DP_REQUEST_WRITE_PSAI') {
            chrome.runtime.sendMessage({ action: 'DP_WRITE_PSAI_NOTE', psaiCode: event.data.psaiCode || '', text: event.data.text || '', autoSubmit: event.data.autoSubmit !== false }, function(response) {
                window.postMessage({ type: 'DP_WRITE_PSAI_RESULT', data: response || { ok: false, error: 'Extensão não respondeu.' } }, TRUSTED_ORIGIN);
            });
        }
    });
})();
