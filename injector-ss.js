(function() {
    var u = (window.location.href || '').split('?')[0];
    if (u.indexOf('sgd.dominiosistemas.com.br/sgsa/faces/ss.html') === -1) return;
    const oldBtn = document.getElementById('psai-floating-btn');
    if (oldBtn) oldBtn.remove();

    const btn = document.createElement('button');
    btn.id = 'psai-floating-btn';
    btn.innerHTML = '<span>⚡</span><span id="psai-text" style="opacity:0; margin-left:0px; font-size:0px; transition: all 0.2s;">LER SS</span>';
    btn.title = 'Ler SS (DailyPlan)';

    Object.assign(btn.style, {
        position: 'fixed', bottom: '20px', right: '20px', zIndex: '2147483647',
        width: '35px', height: '35px', borderRadius: '50%', border: 'none',
        cursor: 'pointer', backgroundColor: '#FF8000', color: 'white',
        boxShadow: '0 4px 10px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0', opacity: '0.5', overflow: 'hidden', transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)', fontSize: '16px', whiteSpace: 'nowrap'
    });

    btn.onmouseenter = function() {
        btn.style.width = '110px'; btn.style.height = '40px'; btn.style.borderRadius = '20px';
        btn.style.opacity = '1'; btn.style.backgroundColor = '#e67300'; btn.style.padding = '0 15px';
        var txt = document.getElementById('psai-text');
        if (txt) { txt.style.opacity = '1'; txt.style.fontSize = '12px'; txt.style.marginLeft = '8px'; }
    };

    btn.onmouseleave = function() {
        var txt = document.getElementById('psai-text');
        if (txt && txt.innerText.indexOf('...') !== -1) return;
        btn.style.width = '35px'; btn.style.height = '35px'; btn.style.borderRadius = '50%';
        btn.style.opacity = '0.5'; btn.style.padding = '0'; btn.style.backgroundColor = '#FF8000';
        if (txt) { txt.style.opacity = '0'; txt.style.fontSize = '0px'; txt.style.marginLeft = '0px'; }
    };

    btn.onclick = function() {
        var txtSpan = document.getElementById('psai-text');
        if (txtSpan) { txtSpan.style.opacity = '1'; txtSpan.style.fontSize = '12px'; txtSpan.style.marginLeft = '8px'; txtSpan.innerText = 'Lendo...'; }
        btn.style.width = '110px'; btn.style.height = '40px'; btn.style.borderRadius = '20px'; btn.style.opacity = '1'; btn.style.padding = '0 15px';

        var ssNumber = '';
        var urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('ss')) {
            ssNumber = String(urlParams.get('ss')).trim().replace(/\D/g, '');
        }
        if (!ssNumber) {
            var m = document.body.innerText.match(/Número:\s*(\d+)/);
            if (m) ssNumber = m[1];
        }
        var title = ssNumber ? 'SS ' + ssNumber : 'Nova Análise';
        var fullHtml = document.documentElement.outerHTML;

        chrome.storage.local.get(['myCasesV14'], function(result) {
            var cases = result.myCasesV14 ? JSON.parse(result.myCasesV14) : [];
            var newId = Date.now();
            var newCase = {
                id: newId,
                title: title,
                lastUpdated: newId,
                workType: 'SS',
                ssNumero: ssNumber,
                ssAssunto: '',
                ssProblema: '',
                ssPassos: '',
                ssSubtopic: '',
                ssDetalheTecnico: '',
                ssBancoCliente: false,
                ssStatus: 'Em análise',
                ssComplexidade: 'Média',
                ssResumoAI: '',
                ssTramites: [],
                ssTramitesCount: 0,
                ssProximoPasso: '',
                ssApoio: '',
                ssValidadoCom: '',
                ssValidadoData: '',
                caseType: '',
                psaiDesc: '',
                psaiLink: '',
                companyTest: '',
                obs: '',
                saiGenerated: '',
                saiChangeLevel: '',
                saiScore: '',
                status: 'Em definição',
                priority: 'null',
                deadline: '',
                links: [],
                researchByTopic: { saiLiberadas: [], ne: [], outros: [] },
                managerReviews: [],
                tests: '',
                solution: ''
            };
            cases.push(newCase);
            chrome.storage.local.set({ myCasesV14: JSON.stringify(cases), pendingSSHtml: fullHtml, pendingSSCaseId: newId }, function() {
                try { chrome.tabs.create({ url: chrome.runtime.getURL('painel.html') }); } catch (e) {}
                alert('✅ SS capturada!\nNúmero: ' + (ssNumber || '(não identificado)') + '\nO painel será preenchido automaticamente.');
                if (txtSpan) txtSpan.innerText = 'LER SS';
                if (!btn.matches(':hover')) btn.onmouseleave();
            });
        });
    };
    document.body.appendChild(btn);
})();
