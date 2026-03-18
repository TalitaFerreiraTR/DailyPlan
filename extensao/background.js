// Abre o painel na mesma aba ao clicar no ícone da extensão
chrome.action.onClicked.addListener(function() {
    var url = chrome.runtime.getURL('painel.html');
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs[0]) {
            chrome.tabs.update(tabs[0].id, { url: url });
        } else {
            chrome.tabs.create({ url: url });
        }
    });
});
