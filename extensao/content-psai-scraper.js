/**
 * Content script: ponte de escrita para o DailyPlan na PSAI.
 * Roda em https://sgd.dominiosistemas.com.br/sgsa/faces/psai.html*
 * - WRITE_PSAI_NOTE: preenche o campo de anotação/trâmite e submete.
 * - DISCOVER_PSAI_FORM: lista campos editáveis da página.
 */
(function() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) return;

    var FIELD_KEYWORDS = ['anotac', 'tramite', 'observac', 'texto', 'conteudo', 'descricao', 'mensagem', 'nota', 'comment'];
    var SUBMIT_KEYWORDS = ['salvar', 'enviar', 'gravar', 'adicionar', 'incluir', 'save', 'submit', 'ok', 'confirmar'];

    function discoverFormFields() {
        var results = { textareas: [], inputs: [], iframes: [], buttons: [], forms: [] };
        document.querySelectorAll('textarea').forEach(function(el) {
            results.textareas.push({ id: el.id, name: el.name, className: el.className, placeholder: el.placeholder, rows: el.rows, visible: el.offsetParent !== null });
        });
        document.querySelectorAll('input[type="text"], input[type="hidden"][name*="ViewState"]').forEach(function(el) {
            results.inputs.push({ id: el.id, name: el.name, type: el.type, className: el.className, visible: el.offsetParent !== null });
        });
        document.querySelectorAll('iframe').forEach(function(el) {
            results.iframes.push({ id: el.id, name: el.name, className: el.className, src: el.src || '', visible: el.offsetParent !== null });
        });
        document.querySelectorAll('button, input[type="submit"], input[type="button"], a[onclick]').forEach(function(el) {
            var text = (el.textContent || el.value || '').trim().substring(0, 60);
            results.buttons.push({ tag: el.tagName, id: el.id, name: el.name || '', className: el.className, text: text, type: el.type || '', visible: el.offsetParent !== null });
        });
        document.querySelectorAll('form').forEach(function(el) {
            results.forms.push({ id: el.id, name: el.name, action: el.action, method: el.method });
        });
        return results;
    }

    function findWritableField() {
        var ta = document.querySelectorAll('textarea');
        for (var i = 0; i < ta.length; i++) {
            var hint = ((ta[i].id || '') + ' ' + (ta[i].name || '') + ' ' + (ta[i].className || '') + ' ' + (ta[i].placeholder || '')).toLowerCase();
            for (var k = 0; k < FIELD_KEYWORDS.length; k++) {
                if (hint.indexOf(FIELD_KEYWORDS[k]) !== -1 && ta[i].offsetParent !== null) return { type: 'textarea', el: ta[i] };
            }
        }
        var iframes = document.querySelectorAll('iframe');
        for (var f = 0; f < iframes.length; f++) {
            try {
                var iframeDoc = iframes[f].contentDocument || iframes[f].contentWindow.document;
                var body = iframeDoc.body;
                if (body && (body.contentEditable === 'true' || body.designMode === 'on' || iframeDoc.designMode === 'on')) {
                    return { type: 'iframe', el: iframes[f], body: body };
                }
            } catch (e) {}
        }
        for (var j = 0; j < ta.length; j++) {
            if (ta[j].offsetParent !== null && !ta[j].readOnly && !ta[j].disabled) return { type: 'textarea', el: ta[j] };
        }
        var editables = document.querySelectorAll('[contenteditable="true"]');
        for (var c = 0; c < editables.length; c++) {
            if (editables[c].offsetParent !== null) return { type: 'contenteditable', el: editables[c] };
        }
        return null;
    }

    function findSubmitButton(field) {
        var container = field.el.closest('form') || field.el.closest('div') || document.body;
        var btns = container.querySelectorAll('button, input[type="submit"], input[type="button"], a[onclick]');
        for (var i = 0; i < btns.length; i++) {
            var text = ((btns[i].textContent || btns[i].value || '') + ' ' + (btns[i].title || '')).toLowerCase();
            for (var k = 0; k < SUBMIT_KEYWORDS.length; k++) {
                if (text.indexOf(SUBMIT_KEYWORDS[k]) !== -1 && btns[i].offsetParent !== null) return btns[i];
            }
        }
        var allBtns = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
        for (var j = 0; j < allBtns.length; j++) {
            var txt = ((allBtns[j].textContent || allBtns[j].value || '') + ' ' + (allBtns[j].title || '')).toLowerCase();
            for (var m = 0; m < SUBMIT_KEYWORDS.length; m++) {
                if (txt.indexOf(SUBMIT_KEYWORDS[m]) !== -1 && allBtns[j].offsetParent !== null) return allBtns[j];
            }
        }
        return null;
    }

    function writeNote(text, autoSubmit) {
        var field = findWritableField();
        if (!field) return { ok: false, error: 'Nenhum campo editável encontrado na página da PSAI. Verifique se a página está completa.' };
        try {
            if (field.type === 'textarea') {
                field.el.focus();
                field.el.value = text;
                field.el.dispatchEvent(new Event('input', { bubbles: true }));
                field.el.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (field.type === 'iframe') {
                field.body.innerHTML = text.replace(/\n/g, '<br>');
            } else if (field.type === 'contenteditable') {
                field.el.focus();
                field.el.innerHTML = text.replace(/\n/g, '<br>');
                field.el.dispatchEvent(new Event('input', { bubbles: true }));
            }
        } catch (e) {
            return { ok: false, error: 'Erro ao preencher campo: ' + (e.message || e) };
        }
        if (autoSubmit) {
            var btn = findSubmitButton(field);
            if (btn) {
                btn.click();
                return { ok: true, submitted: true, fieldType: field.type };
            }
            return { ok: true, submitted: false, fieldType: field.type, warning: 'Campo preenchido, mas botão de envio não encontrado. Submeta manualmente no SGD.' };
        }
        return { ok: true, submitted: false, fieldType: field.type };
    }

    chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
        if (!msg || !msg.action) return;

        if (msg.action === 'DISCOVER_PSAI_FORM') {
            try {
                sendResponse({ fields: discoverFormFields() });
            } catch (e) {
                sendResponse({ error: (e && e.message) || 'Erro ao descobrir formulário' });
            }
            return true;
        }

        if (msg.action === 'WRITE_PSAI_NOTE') {
            try {
                var result = writeNote(msg.text || '', msg.autoSubmit !== false);
                sendResponse(result);
            } catch (e) {
                sendResponse({ ok: false, error: (e && e.message) || 'Erro ao escrever anotação' });
            }
            return true;
        }
    });
})();
