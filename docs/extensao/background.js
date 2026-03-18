chrome.action.onClicked.addListener(function() {
    chrome.tabs.query({ url: 'https://talitaferreiratr.github.io/DailyPlan/*' }, function(tabs) {
        if (tabs.length > 0) {
            chrome.tabs.update(tabs[0].id, { active: true });
        } else {
            chrome.tabs.create({ url: 'https://talitaferreiratr.github.io/DailyPlan/' });
        }
    });
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
