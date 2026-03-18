(function() {
    var SYNC_KEYS = ['myCasesV14', 'generalNotesList', 'myGroupsV1'];

    function mergeToLocalStorage() {
        chrome.storage.local.get(SYNC_KEYS, function(extData) {
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

                var added = 0;
                extItems.forEach(function(item) {
                    if (item.id && !existingIds[item.id]) {
                        localItems.push(item);
                        existingIds[item.id] = true;
                        added++;
                    }
                });

                if (added > 0) {
                    localStorage.setItem(key, JSON.stringify(localItems));
                    window.dispatchEvent(new StorageEvent('storage', { key: key, newValue: JSON.stringify(localItems) }));
                }
            });
        });
    }

    mergeToLocalStorage();

    chrome.storage.onChanged.addListener(function(changes) {
        var relevant = SYNC_KEYS.some(function(k) { return !!changes[k]; });
        if (relevant) mergeToLocalStorage();
    });
})();
