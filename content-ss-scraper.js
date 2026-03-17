/**
 * Content script: ponte para o DailyPlan.
 * Roda em https://sgd.dominiosistemas.com.br/sgsa/faces/ss.html*
 * Ao receber "SCRAPE_SS", lê o HTML da página e envia para o painel preencher automaticamente.
 */
(function() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) return;

    chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
        if (msg.action !== 'SCRAPE_SS') return;
        try {
            var html = document.documentElement.outerHTML;
            sendResponse({ html: html });
        } catch (e) {
            sendResponse({ error: (e && e.message) || 'Erro ao ler página' });
        }
        return true;
    });
})();
