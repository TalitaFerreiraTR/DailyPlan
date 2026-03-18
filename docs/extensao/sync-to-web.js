(function() {
    var SYNC_KEYS = ['myCasesV14', 'generalNotesList', 'myGroupsV1'];

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
                var s = document.createElement('script');
                s.textContent = '(function(){try{' +
                    'var c=JSON.parse(localStorage.getItem("myCasesV14")||"[]");' +
                    'var n=JSON.parse(localStorage.getItem("generalNotesList")||"[]");' +
                    'var g=JSON.parse(localStorage.getItem("myGroupsV1")||"[]");' +
                    'if(typeof cases!=="undefined")cases=c;' +
                    'if(typeof notes!=="undefined")notes=n;' +
                    'if(typeof groups!=="undefined")groups=g;' +
                    'if(typeof renderSidebar==="function")renderSidebar();' +
                    'if(typeof renderNotes==="function")renderNotes();' +
                    'if(typeof _syncToFirestore==="function")_syncToFirestore({myCasesV14:localStorage.getItem("myCasesV14"),generalNotesList:localStorage.getItem("generalNotesList"),myGroupsV1:localStorage.getItem("myGroupsV1")});' +
                    '}catch(e){}})();';
                (document.head || document.documentElement).appendChild(s);
                s.remove();
            }
        });
    }

    if (document.readyState === 'complete') {
        setTimeout(mergeAndNotify, 1500);
    } else {
        window.addEventListener('load', function() { setTimeout(mergeAndNotify, 1500); });
    }

    chrome.storage.onChanged.addListener(function(changes) {
        var relevant = SYNC_KEYS.some(function(k) { return !!changes[k]; });
        if (relevant) setTimeout(mergeAndNotify, 500);
    });
})();
