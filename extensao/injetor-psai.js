(function() {
    var u = (window.location.href || '').split('?')[0];
    if (u !== 'https://sgd.dominiosistemas.com.br/sgsa/faces/psai.html') return;
    const oldBtn = document.getElementById('psai-floating-btn');
    if (oldBtn) oldBtn.remove();

    const btn = document.createElement('button');
    btn.id = 'psai-floating-btn';
    btn.innerHTML = '<span>⚡</span><span id="psai-text" style="opacity:0; margin-left:0px; font-size:0px; transition: all 0.2s;">LER SAs</span>';
    btn.title = 'Ler SAs (DailyPlan)';
    
    Object.assign(btn.style, {
        position: 'fixed', bottom: '20px', right: '20px', zIndex: '2147483647',
        width: '35px', height: '35px', borderRadius: '50%', border: 'none', 
        cursor: 'pointer', backgroundColor: '#FF8000', color: 'white',
        boxShadow: '0 4px 10px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0', opacity: '0.5', overflow: 'hidden', transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)', fontSize: '16px', whiteSpace: 'nowrap'
    });

    btn.onmouseenter = () => {
        btn.style.width = '110px'; btn.style.height = '40px'; btn.style.borderRadius = '20px';
        btn.style.opacity = '1'; btn.style.backgroundColor = '#e67300'; btn.style.padding = '0 15px';
        const txt = document.getElementById('psai-text');
        if(txt) { txt.style.opacity = '1'; txt.style.fontSize = '12px'; txt.style.marginLeft = '8px'; }
    };

    btn.onmouseleave = () => {
        const txt = document.getElementById('psai-text');
        if (txt && txt.innerText.includes('...')) return;
        btn.style.width = '35px'; btn.style.height = '35px'; btn.style.borderRadius = '50%';
        btn.style.opacity = '0.5'; btn.style.padding = '0'; btn.style.backgroundColor = '#FF8000';
        if(txt) { txt.style.opacity = '0'; txt.style.fontSize = '0px'; txt.style.marginLeft = '0px'; }
    };

    btn.onclick = async function() {
        const txtSpan = document.getElementById('psai-text');
        if(txtSpan) { txtSpan.style.opacity = '1'; txtSpan.style.fontSize = '12px'; txtSpan.style.marginLeft = '8px'; txtSpan.innerText = 'Lendo...'; }
        btn.style.width = '110px'; btn.style.height = '40px'; btn.style.borderRadius = '20px'; btn.style.opacity = '1'; btn.style.padding = '0 15px';
        
        try {
            let psaiNumber = "";
            const urlParams = new URLSearchParams(window.location.search);
            if(urlParams.has('psai')) psaiNumber = urlParams.get('psai');
            else { const m = document.body.innerText.match(/PSAI\s*[:\-#]?\s*(\d+)/i); if(m) psaiNumber = m[1]; }
            const title = psaiNumber ? `PSAI ${psaiNumber}` : "Nova Análise";

            let tipoCapturado = "";
            const cells = Array.from(document.querySelectorAll('td.tableVisualizacaoField'));
            const targetCell = cells.find(td => td.innerText.includes('Tipo:'));
            if (targetCell) tipoCapturado = targetCell.innerText.replace('Tipo:', '').trim();
            else { const mType = document.body.innerText.match(/Tipo:\s*([^\n\r]+)/i); if(mType) tipoCapturado = mType[1].trim(); }

            let psaiNivel = "";
            const allB = document.querySelectorAll('b');
            for (let bi = 0; bi < allB.length; bi++) {
                if (/Nível da alteração:/i.test((allB[bi].textContent || '').trim())) {
                    const parent = allB[bi].parentElement;
                    const fullText = parent ? (parent.innerText || parent.textContent || '').trim() : '';
                    psaiNivel = fullText.replace(/Nível da alteração:\s*/i, '').trim().split(/\s+/)[0] || '';
                    break;
                }
            }

            let psaiData = "";
            const dataCell = cells.find(td => (td.innerText || '').trim().indexOf('Data:') !== -1);
            if (dataCell) {
                const dateMatch = (dataCell.innerText || '').match(/Data:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
                if (dateMatch && dateMatch[1]) {
                    const parts = dateMatch[1].match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
                    if (parts) {
                        let y = parseInt(parts[3], 10);
                        if (y < 100) y += 2000;
                        psaiData = y + '-' + ('0' + parts[2]).slice(-2) + '-' + ('0' + parts[1]).slice(-2);
                    }
                }
            }

            let psaiDesc = "";
            const divJustify = document.querySelector('div[align="justify"]');
            if (divJustify) psaiDesc = divJustify.innerText.trim();

            let saLinks = [];
            const matchSAs = document.body.innerText.match(/SAs:\s*([0-9,\s]+)/i);
            if (matchSAs && matchSAs[1]) {
                const numbers = matchSAs[1].split(',').map(n => n.trim()).filter(n => n.length > 0);
                const uniqueNumbers = [...new Set(numbers)];
                for (const num of uniqueNumbers) {
                    const url = `https://sgd.dominiosistemas.com.br/sgsa/faces/sa.html?sa=${num}`;
                    let desc = "Carregando...";
                    try {
                        const resp = await fetch(url);
                        const text = await resp.text();
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(text, 'text/html');
                        const dj = doc.querySelector('div[align="justify"]');
                        if (dj) desc = dj.innerText.trim();
                        else {
                            const tds = Array.from(doc.querySelectorAll('td'));
                            const ld = tds.find(t => t.innerText.includes('Descrição:'));
                            if(ld && ld.parentElement) desc = ld.parentElement.innerText.replace('Descrição:', '').trim();
                        }
                    } catch (e) { desc = "Erro acesso"; }
                    desc = desc.replace(/\s+/g, ' ');
                    saLinks.push({ code: `SA ${num}`, link: url, desc: desc });
                }
            }

            chrome.storage.local.get(['myCasesV14'], function(result) {
                let cases = result.myCasesV14 ? JSON.parse(result.myCasesV14) : [];
                const newCase = {
                    id: Date.now(), title: title, caseType: tipoCapturado,
                    workType: "PSAI", psaiDesc: psaiDesc, psaiLink: window.location.href, psaiNivel: psaiNivel, psaiData: psaiData,
                    companyTest: "", obs: "", saiGenerated: "", saiChangeLevel: "", saiScore: "",
                    lastUpdated: Date.now(), status: "Fila", priority: "null", deadline: "",
                    links: saLinks, researchByTopic: { saiLiberadas: [], ne: [], outros: [] }, managerReviews: [], tests: "", solution: ""
                };
                cases.push(newCase);
                chrome.storage.local.set({ 'myCasesV14': JSON.stringify(cases) }, function() {
                    alert(`✅ Captura OK!\nTipo: ${tipoCapturado}\nSAs: ${saLinks.length}`);
                    if(txtSpan) txtSpan.innerText = 'LER SAs';
                    if(!btn.matches(':hover')) btn.onmouseleave();
                });
            });
        } catch (err) {
            alert("Erro: " + err.message);
            if(txtSpan) txtSpan.innerText = 'LER SAs';
        }
    };
    document.body.appendChild(btn);
})();