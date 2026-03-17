(function() {
    var u = (window.location.href || '').split('?')[0];
    if (u.indexOf('sgsai.dominiosistemas.com.br/sgsai/faces/sai.html') === -1) return;
    const oldBtn = document.getElementById('psai-floating-btn');
    if (oldBtn) oldBtn.remove();

    const btn = document.createElement('button');
    btn.id = 'psai-floating-btn';
    btn.innerHTML = '<span>⚡</span><span id="psai-text" style="opacity:0; margin-left:0px; font-size:0px; transition: all 0.2s;">LER SAI</span>';
    btn.title = 'Ler SAI (DailyPlan)';

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

        var saiNumber = '';
        var urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('sai')) {
            saiNumber = String(urlParams.get('sai')).trim().replace(/\D/g, '');
        }
        if (!saiNumber) {
            var elNumero = document.querySelector('[id="td:numero_sai"]');
            if (elNumero) {
                var raw = (elNumero.innerText || elNumero.textContent || '').trim();
                raw = raw.replace(/^Número:\s*/i, '').trim();
                var onlyDigits = raw.match(/^\d+$/);
                if (onlyDigits) saiNumber = onlyDigits[0];
                else if (raw) saiNumber = raw.replace(/\D/g, '').trim() || '';
            }
        }
        if (!saiNumber) {
            var m = document.body.innerText.match(/SAI\s*[:\-#]?\s*(\d+)/i);
            if (m) saiNumber = m[1];
        }
        var title = saiNumber ? 'SAI ' + saiNumber : 'Nova Análise';

        /* Assunto: div#divDescricaoSAI – texto puro (innerText), sem tags; normalizar espaços do justify */
        var assunto = '';
        try {
            var divAssunto = document.getElementById('divDescricaoSAI');
            if (divAssunto) {
                assunto = (divAssunto.innerText || divAssunto.textContent || '').trim();
                assunto = assunto.replace(/\s+/g, ' ').trim();
            } else {
                console.warn('[DailyPlan SAI] Elemento não encontrado: divDescricaoSAI (Campo Assunto).');
            }
        } catch (e) {
            console.warn('[DailyPlan SAI] Erro ao ler Assunto (divDescricaoSAI):', e.message);
        }

        /* Data: td#td:data_entrada_sai – extrair apenas o valor da data após o rótulo "Data:" */
        var dataVal = '';
        try {
            var tdData = document.querySelector('[id="td:data_entrada_sai"]');
            if (tdData) {
                var rawData = (tdData.innerText || tdData.textContent || '').trim();
                var dateMatch = rawData.match(/Data:\s*([\d\/\.\-]+)/i);
                if (dateMatch && dateMatch[1]) {
                    dataVal = dateMatch[1].trim();
                    var parts = dataVal.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
                    if (parts) {
                        var d = parseInt(parts[1], 10), m = parseInt(parts[2], 10), y = parseInt(parts[3], 10);
                        if (y < 100) y += 2000;
                        dataVal = y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
                    }
                }
            } else {
                console.warn('[DailyPlan SAI] Elemento não encontrado: td:data_entrada_sai (Campo Data).');
            }
        } catch (e) {
            console.warn('[DailyPlan SAI] Erro ao ler Data (td:data_entrada_sai):', e.message);
        }

        chrome.storage.local.get(['myCasesV14'], function(result) {
            var cases = result.myCasesV14 ? JSON.parse(result.myCasesV14) : [];
            var newCase = {
                id: Date.now(),
                title: title,
                lastUpdated: Date.now(),
                workType: 'SAI',
                saiGenerated: saiNumber,
                saiAssunto: assunto,
                saiData: dataVal,
                saiChangeLevel: '',
                saiScore: '',
                caseType: '',
                psaiDesc: '',
                psaiLink: '',
                companyTest: '',
                obs: '',
                ssNumero: '',
                ssAssunto: '',
                ssProblema: '',
                ssPassos: '',
                ssBancoCliente: false,
                ssStatus: 'Em análise',
                ssComplexidade: 'Média',
                ssResumoAI: '',
                ssProximoPasso: '',
                ssApoio: '',
                ssValidadoCom: '',
                ssValidadoData: '',
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
            chrome.storage.local.set({ myCasesV14: JSON.stringify(cases) }, function() {
                alert('✅ SAI capturada!\nCódigo: ' + (saiNumber || '(não identificado)'));
                if (txtSpan) txtSpan.innerText = 'LER SAI';
                if (!btn.matches(':hover')) btn.onmouseleave();
            });
        });
    };
    document.body.appendChild(btn);
})();
