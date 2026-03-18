// VARIÁVEIS GLOBAIS
let cases = [];
let notes = [];
let groups = []; // { id, name, caseIds: [] }
let currentId = null;
let currentGroupId = null;
let workTypeFilter = 'all'; // 'all' | 'PSAI' | 'SS' | 'SAI' | 'NE'
let savedRange = null;
let savedFocusElement = null;
let autoSaveTimer = null;
var currentUser = null; // { username, role: 'normal'|'gerente'|'desenvolvedor' }

var APP_VERSION = '6.0';
var firebaseUid = null;
var _firestoreSaveTimer = null;
var _firestorePendingData = {};
var SYNC_KEYS = ['myCasesV14', 'generalNotesList', 'myGroupsV1'];

// --- STORAGE: localStorage como cache rapido + Firestore como persistencia ---
function storageGet(keys, callback) {
    var result = {};
    keys.forEach(function(k) { result[k] = localStorage.getItem(k) || null; });
    callback(result);
}
function storageSet(obj, callback) {
    Object.keys(obj).forEach(function(k) { localStorage.setItem(k, obj[k]); });
    if (callback) callback();
    _syncToFirestore(obj);
}
function storageRemove(keys, callback) {
    (Array.isArray(keys) ? keys : [keys]).forEach(function(k) { localStorage.removeItem(k); });
    if (callback) callback();
}
function _syncToFirestore(obj) {
    if (!firebaseUid || typeof db === 'undefined') return;
    Object.keys(obj).forEach(function(k) { _firestorePendingData[k] = obj[k]; });
    clearTimeout(_firestoreSaveTimer);
    _firestoreSaveTimer = setTimeout(_flushToFirestore, 2000);
}
function _flushToFirestore() {
    if (!firebaseUid || typeof db === 'undefined' || Object.keys(_firestorePendingData).length === 0) return;
    var update = { lastUpdated: firebase.firestore.FieldValue.serverTimestamp() };
    Object.keys(_firestorePendingData).forEach(function(k) { update[k] = _firestorePendingData[k]; });
    _firestorePendingData = {};
    db.collection('users').doc(firebaseUid).set(update, { merge: true }).catch(function(e) { console.warn('Firestore save error:', e); });
}
window.addEventListener('beforeunload', _flushToFirestore);

function _loadFromFirestore(callback) {
    if (!firebaseUid || typeof db === 'undefined') { if (callback) callback(); return; }
    db.collection('users').doc(firebaseUid).get().then(function(doc) {
        if (doc.exists) {
            var data = doc.data();
            SYNC_KEYS.forEach(function(k) {
                if (data[k]) localStorage.setItem(k, data[k]);
            });
        }
        if (callback) callback();
    }).catch(function(e) { console.warn('Firestore load error:', e); if (callback) callback(); });
}

// --- AUTENTICACAO FIREBASE + GITHUB ---
function loginWithGitHub() {
    var errorEl = document.getElementById('login-error');
    if (errorEl) errorEl.textContent = '';
    firebase.auth().signInWithPopup(githubProvider).catch(function(err) {
        if (errorEl) errorEl.textContent = 'Erro ao entrar: ' + (err.message || err.code || 'tente novamente');
    });
}
function logoutUser() {
    firebase.auth().signOut().then(function() {
        currentUser = null;
        firebaseUid = null;
        localStorage.clear();
        location.reload();
    });
}
function getCurrentUserSync() { return currentUser; }

function showUserBar() {
    var bar = document.getElementById('user-bar');
    var nameEl = document.getElementById('user-display-name');
    var roleEl = document.getElementById('user-role-label');
    var avatarEl = document.getElementById('user-avatar');
    var adminBtn = document.getElementById('btn-admin-panel');
    if (!bar || !currentUser) return;
    bar.style.display = 'flex';
    if (nameEl) nameEl.textContent = currentUser.username || '';
    if (roleEl) roleEl.textContent = currentUser.role === 'gerente' ? 'Gerente (Admin)' : 'Analista';
    if (avatarEl && currentUser.photoURL) { avatarEl.src = currentUser.photoURL; avatarEl.style.display = 'block'; } else if (avatarEl) { avatarEl.style.display = 'none'; }
    if (adminBtn) adminBtn.style.display = (currentUser.role === 'gerente') ? 'flex' : 'none';
}

function _onAuthReady(fbUser, callback) {
    if (!fbUser) {
        document.body.classList.add('auth-required');
        return;
    }
    firebaseUid = fbUser.uid;
    var userRef = db.collection('users').doc(fbUser.uid);
    userRef.get().then(function(doc) {
        var role = 'normal';
        if (doc.exists && doc.data().role) {
            role = doc.data().role;
        } else {
            userRef.set({
                displayName: fbUser.displayName || fbUser.email || '',
                email: fbUser.email || '',
                photoURL: fbUser.photoURL || '',
                role: 'normal',
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }
        currentUser = {
            username: fbUser.displayName || fbUser.email || 'usuario',
            role: role,
            photoURL: fbUser.photoURL || '',
            uid: fbUser.uid
        };
        _loadFromFirestore(function() {
            document.body.classList.remove('auth-required');
            if (callback) callback();
        });
    }).catch(function(e) {
        console.warn('Auth profile error:', e);
        currentUser = { username: fbUser.displayName || 'usuario', role: 'normal', photoURL: fbUser.photoURL || '', uid: fbUser.uid };
        document.body.classList.remove('auth-required');
        if (callback) callback();
    });
}

// --- ADMIN: ver dados de todos os usuarios ---
function loadAdminUsersList() {
    var list = document.getElementById('admin-users-list');
    if (!list) return;
    list.innerHTML = '<p style="color:var(--text-secondary); font-size:12px;">Carregando...</p>';
    db.collection('users').get().then(function(snapshot) {
        if (snapshot.empty) { list.innerHTML = '<p style="color:var(--text-secondary);">Nenhum usuario encontrado.</p>'; return; }
        var html = '';
        snapshot.forEach(function(doc) {
            var d = doc.data();
            var casesCount = 0;
            try { casesCount = JSON.parse(d.myCasesV14 || '[]').length; } catch (e) {}
            html += '<div class="admin-user-item" data-uid="' + doc.id + '">' +
                '<img src="' + (d.photoURL || '') + '" onerror="this.style.display=\'none\'" alt="">' +
                '<div style="flex:1;"><div class="admin-user-name">' + escapeHtml(d.displayName || d.email || doc.id) + '</div>' +
                '<div class="admin-user-meta">' + (d.role === 'gerente' ? 'Gerente' : 'Analista') + ' | ' + casesCount + ' analises</div></div></div>';
        });
        list.innerHTML = html;
        list.querySelectorAll('.admin-user-item').forEach(function(el) {
            el.addEventListener('click', function() { viewUserData(el.getAttribute('data-uid')); });
        });
    }).catch(function(e) { list.innerHTML = '<p style="color:var(--danger);">Erro ao carregar: ' + e.message + '</p>'; });
}

function viewUserData(uid) {
    db.collection('users').doc(uid).get().then(function(doc) {
        if (!doc.exists) { alert('Usuario nao encontrado.'); return; }
        var d = doc.data();
        var userCases = [];
        try { userCases = JSON.parse(d.myCasesV14 || '[]'); } catch (e) {}
        toggleModal('modal-admin', false);
        cases = userCases;
        currentId = null;
        renderSidebar();
        var main = document.getElementById('main');
        if (main) {
            var banner = document.createElement('div');
            banner.id = 'admin-view-banner';
            banner.style.cssText = 'padding:10px 16px;background:rgba(255,128,0,0.15);border-bottom:1px solid var(--tr-orange);font-size:12px;color:var(--tr-orange);display:flex;align-items:center;justify-content:space-between;';
            banner.innerHTML = '<span>Visualizando dados de <strong>' + escapeHtml(d.displayName || uid) + '</strong> (somente leitura)</span><button type="button" onclick="exitAdminView()" style="background:var(--tr-orange);color:#fff;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:11px;">Voltar aos meus dados</button>';
            var existing = document.getElementById('admin-view-banner');
            if (existing) existing.remove();
            main.prepend(banner);
        }
    });
}

function exitAdminView() {
    var banner = document.getElementById('admin-view-banner');
    if (banner) banner.remove();
    storageGet(['myCasesV14', 'generalNotesList', 'myGroupsV1'], function(result) {
        if (result.myCasesV14) { try { cases = JSON.parse(result.myCasesV14); } catch (e) { cases = []; } } else { cases = []; }
        if (result.generalNotesList) { try { notes = JSON.parse(result.generalNotesList); } catch (e) { notes = []; } } else { notes = []; }
        if (result.myGroupsV1) { try { groups = JSON.parse(result.myGroupsV1); } catch (e) { groups = []; } } else { groups = []; }
        currentId = null;
        renderSidebar();
    });
}

// --- UTILITÁRIOS GLOBAIS ---
function getEl(id) { return id ? document.getElementById(id) : null; }
function getVal(id) { var el = getEl(id); return el ? el.value : ''; }
function setVal(id, val) { var el = getEl(id); if (el) el.value = (val != null && val !== undefined) ? val : ''; }
function getHTML(id) { var el = getEl(id); return el ? el.innerHTML : ''; }
function setHTML(id, val) { var el = getEl(id); if (el) el.innerHTML = (val != null && val !== undefined) ? val : ''; }
function escapeHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function getElementText(el) { return el ? (el.innerText || el.textContent || '').trim() : ''; }

/** Extrai texto de um elemento preservando quebras: <br> e blocos (div, p) viram \\n. Sem limite de tamanho. */
function getElementTextWithBreaks(el) {
    if (!el || !el.innerHTML) return '';
    var html = el.innerHTML;
    html = html.replace(/<br\s*\/?>/gi, '\n');
    html = html.replace(/<\/div>/gi, '\n').replace(/<div[^>]*>/gi, '');
    html = html.replace(/<\/p>/gi, '\n').replace(/<p[^>]*>/gi, '');
    html = html.replace(/<[^>]+>/g, '');
    html = html.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
    return html.replace(/\n{3,}/g, '\n\n').trim();
}
function formatDateDDMMAAAA(dateStr) {
    if (!dateStr) return '';
    var m = (dateStr + '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return m[3] + '/' + m[2] + '/' + m[1];
    var d = new Date(dateStr);
    if (!isNaN(d.getTime())) return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
    return dateStr;
}
function setCheck(id, val) { var el = getEl(id); if (el) el.checked = !!val; }
function openUrlInNewTab(url) { if (!url) return; if (typeof chrome !== 'undefined' && chrome.tabs) chrome.tabs.create({ url: url }); else window.open(url, '_blank'); }

// FUNÇÕES DE INICIALIZAÇÃO
function init() {
    var savedTheme = localStorage.getItem('psaiTheme');
    var deadlineEl = getEl('input-deadline');
    if (savedTheme === 'light') { document.body.classList.remove('dark-mode'); if (deadlineEl) deadlineEl.style.colorScheme = 'light'; }
    else { document.body.classList.add('dark-mode'); localStorage.setItem('psaiTheme', 'dark'); if (deadlineEl) deadlineEl.style.colorScheme = 'dark'; }

    function loadFromStorage() {
        storageGet(['myCasesV14', 'generalNotesList', 'myGroupsV1'], function(result) {
            if (result.myCasesV14) { try { cases = JSON.parse(result.myCasesV14); } catch (e) { cases = []; } cases.forEach(function(c) { if (!c.workType) c.workType = 'PSAI'; }); } else { cases = []; }
            if (result.generalNotesList) { try { notes = JSON.parse(result.generalNotesList); } catch (e) { notes = []; } } else { notes = []; }
            if (result.myGroupsV1) { try { groups = JSON.parse(result.myGroupsV1); } catch (e) { groups = []; } } else { groups = []; }
            renderSidebar(); renderNotes();
            tryApplyPendingSS();
        });
    }
    loadFromStorage();
    window.addEventListener('storage', function(e) {
        if (e.key === 'myCasesV14' && e.newValue) { try { cases = JSON.parse(e.newValue); } catch (ex) {} renderSidebar(); }
        if (e.key === 'myGroupsV1' && e.newValue) { try { groups = JSON.parse(e.newValue); } catch (ex) {} renderSidebar(); renderGroupsList(); }
        if (e.key === 'generalNotesList' && e.newValue) { try { notes = JSON.parse(e.newValue); } catch (ex) {} renderNotes(); }
        if (e.key === 'pendingSSHtml' || e.key === 'pendingSSCaseId') tryApplyPendingSS();
    });
}

// --- FUNÇÕES DE NOTAS ---
function renderNotes() {
    var listArea = getEl('notes-list-area'); if (!listArea) return; listArea.innerHTML = '';
    if (notes.length === 0) { listArea.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-secondary); opacity:0.7;">Nenhuma nota ainda.</div>'; return; }
    const sortedNotes = [...notes].sort((a,b) => b.id - a.id);
    sortedNotes.forEach(note => {
        const div = document.createElement('div'); div.className = 'note-card'; div.setAttribute('data-note-id', note.id);
        const contentDiv = document.createElement('div'); contentDiv.className = 'note-content'; contentDiv.contentEditable = 'true'; contentDiv.innerHTML = note.text || '';
        const footer = document.createElement('div'); footer.className = 'note-footer';
        footer.innerHTML = '<span class="note-date">' + escapeHtml(note.date || '') + '</span><button type="button" class="note-delete" data-id="' + note.id + '">Excluir</button>';
        footer.querySelector('.note-delete').addEventListener('click', () => deleteNote(note.id));
        contentDiv.addEventListener('blur', function() {
            const n = notes.find(x => x.id === note.id); if (n) { n.text = contentDiv.innerHTML; storageSet({ 'generalNotesList': JSON.stringify(notes) }); }
        });
        contentDiv.classList.add('rich-input');
        contentDiv.addEventListener('keyup', saveSelection); contentDiv.addEventListener('mouseup', saveSelection); contentDiv.addEventListener('focus', saveSelection);
        div.appendChild(contentDiv); div.appendChild(footer); listArea.appendChild(div);
    });
}
function addNote() {
    var input = getEl('new-note-input'); if (!input) return;
    var text = (input.innerText || '').trim(); if (!text) return;
    var now = new Date();
    var newNote = { id: Date.now(), text: input.innerHTML || text, date: now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) };
    notes.push(newNote);
    storageSet({ 'generalNotesList': JSON.stringify(notes) });
    input.innerHTML = ''; renderNotes();
}
function deleteNote(id) {
    if (!confirm('Apagar nota?')) return;
    notes = notes.filter(function(n) { return n.id !== id; });
    storageSet({ 'generalNotesList': JSON.stringify(notes) });
    renderNotes();
}

// --- GRUPOS ---
function saveGroups() {
    storageSet({ 'myGroupsV1': JSON.stringify(groups) }, function() { renderSidebar(); renderGroupsList(); });
}
function openGroupView(groupId) {
    var g = groups.find(function(x) { return x.id === groupId; });
    if (!g) return;
    currentGroupId = groupId;
    var emptyState = getEl('empty-state');
    var contentArea = getEl('content-area');
    var groupView = getEl('group-view');
    if (emptyState) emptyState.classList.add('hidden');
    if (contentArea) contentArea.classList.remove('content-area-visible');
    if (groupView) { groupView.classList.add('group-view-visible'); groupView.setAttribute('data-group-id', groupId); }
    renderGroupViewContent();
}
function closeGroupView() {
    currentGroupId = null;
    var groupView = getEl('group-view');
    if (groupView) { groupView.classList.remove('group-view-visible'); groupView.removeAttribute('data-group-id'); }
    var emptyState = getEl('empty-state');
    if (emptyState) emptyState.classList.remove('hidden');
    var contentArea = getEl('content-area');
    if (contentArea) contentArea.classList.remove('content-area-visible');
    renderSidebar();
}
function renderGroupViewContent() {
    var g = groups.find(function(x) { return x.id === currentGroupId; });
    var titleEl = getEl('group-view-title');
    var listEl = getEl('group-view-list');
    var nameEditEl = getEl('group-view-name-edit');
    var nameEditActions = getEl('group-view-name-edit-actions');
    var btnEditName = getEl('btn-group-edit-name');
    if (!titleEl || !listEl) return;
    if (!g) { titleEl.textContent = ''; listEl.innerHTML = ''; return; }
    titleEl.textContent = g.name || 'Sem nome';
    titleEl.style.display = '';
    if (btnEditName) btnEditName.style.display = '';
    if (nameEditEl) nameEditEl.style.display = 'none';
    if (nameEditActions) nameEditActions.style.display = 'none';
    listEl.innerHTML = '';
    var caseIds = g.caseIds || [];
    caseIds.forEach(function(cid) {
        var c = cases.find(function(x) { return x.id === cid; });
        if (!c) return;
        var item = document.createElement('div');
        item.className = 'group-view-case-item';
        var displayId = getCaseDisplayId(c);
        var title = (c.title || 'Sem título').substring(0, 50);
        if ((c.title || '').length > 50) title += '…';
        item.innerHTML = '<span class="group-view-case-id">' + escapeHtml(displayId) + '</span><span class="group-view-case-title">' + escapeHtml(title) + '</span>';
        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'group-view-case-remove';
        removeBtn.setAttribute('aria-label', 'Remover do grupo');
        removeBtn.textContent = '✕';
        removeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            removeCaseFromGroup(currentGroupId, c.id);
        });
        item.appendChild(removeBtn);
        item.addEventListener('click', function() {
            closeGroupView();
            loadCase(c.id);
            var ca = getEl('content-area');
            var es = getEl('empty-state');
            if (ca) ca.classList.add('content-area-visible');
            if (es) es.classList.add('hidden');
        });
        listEl.appendChild(item);
    });
    if (caseIds.length === 0) listEl.innerHTML = '<p style="color:var(--text-secondary); padding:16px;">Nenhuma análise neste grupo.</p>';
}
function renderGroupsList() {
    var listEl = getEl('groups-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    groups.forEach(function(g) {
        var count = (g.caseIds || []).length;
        var item = document.createElement('div');
        item.className = 'group-item' + (currentGroupId === g.id ? ' active' : '');
        item.setAttribute('data-group-id', g.id);
        item.innerHTML = '<span class="group-item-name">' + escapeHtml(g.name || 'Sem nome') + '</span><span class="group-item-count">' + count + '</span>';
        item.addEventListener('click', function() { openGroupView(g.id); });
        listEl.appendChild(item);
    });
}

function openNewGroupModal() {
    setVal('new-group-name', '');
    var container = getEl('new-group-cases');
    if (!container) return;
    container.innerHTML = '';
    cases.forEach(function(c) {
        var label = document.createElement('label');
        label.className = 'new-group-case-row';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.setAttribute('data-case-id', c.id);
        if (currentId === c.id) cb.checked = true;
        var displayId = getCaseDisplayId(c);
        var title = (c.title || 'Sem título').substring(0, 50);
        if ((c.title || '').length > 50) title += '\u2026';
        var textSpan = document.createElement('span');
        textSpan.className = 'new-group-case-text';
        textSpan.textContent = displayId + ' – ' + title;
        label.appendChild(cb);
        label.appendChild(textSpan);
        container.appendChild(label);
    });
    if (cases.length === 0) container.innerHTML = '<p style="color:var(--text-secondary); font-size:12px;">Crie análises antes de agrupar.</p>';
    toggleModal('modal-new-group', true);
}
function createGroupFromModal() {
    var name = (getVal('new-group-name') || '').trim();
    if (!name) { alert('Informe o nome do grupo.'); return; }
    var container = getEl('new-group-cases');
    if (!container) return;
    var caseIds = [];
    container.querySelectorAll('input[type="checkbox"][data-case-id]:checked').forEach(function(cb) {
        var id = parseInt(cb.getAttribute('data-case-id'), 10);
        if (!isNaN(id)) caseIds.push(id);
    });
    if (caseIds.length === 0) { alert('Selecione pelo menos uma análise.'); return; }
    groups.push({ id: Date.now(), name: name, caseIds: caseIds });
    saveGroups();
    toggleModal('modal-new-group', false);
    openGroupView(groups[groups.length - 1].id);
}

function removeCaseFromGroup(groupId, caseId) {
    var g = groups.find(function(x) { return x.id === groupId; });
    if (!g || !g.caseIds) return;
    g.caseIds = g.caseIds.filter(function(id) { return id !== caseId; });
    saveGroups();
    renderGroupViewContent();
    renderGroupsList();
}

function openAddToGroupModal() {
    if (!currentGroupId) return;
    var g = groups.find(function(x) { return x.id === currentGroupId; });
    if (!g) return;
    var titleEl = getEl('modal-add-to-group-title');
    if (titleEl) titleEl.textContent = 'Adicionar ao grupo: ' + (g.name || 'Sem nome');
    var container = getEl('add-to-group-cases');
    if (!container) return;
    container.innerHTML = '';
    var inGroup = g.caseIds || [];
    cases.forEach(function(c) {
        if (inGroup.indexOf(c.id) >= 0) return;
        var label = document.createElement('label');
        label.className = 'new-group-case-row';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.setAttribute('data-case-id', c.id);
        var displayId = getCaseDisplayId(c);
        var title = (c.title || 'Sem título').substring(0, 50);
        if ((c.title || '').length > 50) title += '\u2026';
        var textSpan = document.createElement('span');
        textSpan.className = 'new-group-case-text';
        textSpan.textContent = displayId + ' – ' + title;
        label.appendChild(cb);
        label.appendChild(textSpan);
        container.appendChild(label);
    });
    if (container.children.length === 0) container.innerHTML = '<p style="color:var(--text-secondary); font-size:12px;">Todas as análises já estão neste grupo.</p>';
    toggleModal('modal-add-to-group', true);
}

function addCasesToGroupFromModal() {
    if (!currentGroupId) return;
    var g = groups.find(function(x) { return x.id === currentGroupId; });
    if (!g) return;
    var container = getEl('add-to-group-cases');
    if (!container) return;
    var toAdd = [];
    container.querySelectorAll('input[type="checkbox"][data-case-id]:checked').forEach(function(cb) {
        var id = parseInt(cb.getAttribute('data-case-id'), 10);
        if (!isNaN(id)) toAdd.push(id);
    });
    if (toAdd.length === 0) { alert('Selecione pelo menos uma análise.'); return; }
    if (!g.caseIds) g.caseIds = [];
    toAdd.forEach(function(id) { if (g.caseIds.indexOf(id) < 0) g.caseIds.push(id); });
    saveGroups();
    toggleModal('modal-add-to-group', false);
    renderGroupViewContent();
    renderGroupsList();
}

function deleteGroup() {
    if (!currentGroupId) return;
    if (!confirm('Excluir este grupo? As análises não serão apagadas.')) return;
    groups = groups.filter(function(x) { return x.id !== currentGroupId; });
    saveGroups();
    closeGroupView();
    renderGroupsList();
}

function startEditGroupName() {
    var g = groups.find(function(x) { return x.id === currentGroupId; });
    if (!g) return;
    var titleEl = getEl('group-view-title');
    var nameEditEl = getEl('group-view-name-edit');
    var nameEditActions = getEl('group-view-name-edit-actions');
    var btnEditName = getEl('btn-group-edit-name');
    if (!nameEditEl) return;
    nameEditEl.value = g.name || '';
    titleEl.style.display = 'none';
    if (btnEditName) btnEditName.style.display = 'none';
    nameEditEl.style.display = 'block';
    if (nameEditActions) nameEditActions.style.display = 'inline';
    nameEditEl.focus();
}

function saveGroupName() {
    var g = groups.find(function(x) { return x.id === currentGroupId; });
    if (!g) return cancelEditGroupName();
    var nameEditEl = getEl('group-view-name-edit');
    if (!nameEditEl) return cancelEditGroupName();
    var name = (nameEditEl.value || '').trim();
    if (!name) { alert('Informe o nome do grupo.'); return; }
    g.name = name;
    saveGroups();
    cancelEditGroupName();
    renderGroupViewContent();
    renderGroupsList();
}

function cancelEditGroupName() {
    var titleEl = getEl('group-view-title');
    var nameEditEl = getEl('group-view-name-edit');
    var nameEditActions = getEl('group-view-name-edit-actions');
    var btnEditName = getEl('btn-group-edit-name');
    if (titleEl) titleEl.style.display = '';
    if (btnEditName) btnEditName.style.display = '';
    if (nameEditEl) { nameEditEl.style.display = 'none'; nameEditEl.value = ''; }
    if (nameEditActions) nameEditActions.style.display = 'none';
    var g = groups.find(function(x) { return x.id === currentGroupId; });
    if (g && titleEl) titleEl.textContent = g.name || 'Sem nome';
}

function addNewCase(workType) {
    var un = (currentUser && currentUser.username) ? currentUser.username : '';
    var c = { id: Date.now(), title: "Nova Análise", lastUpdated: Date.now(), workType: workType || (workTypeFilter !== 'all' ? workTypeFilter : "PSAI"), caseType: "", psaiDesc: "", psaiLink: "", psaiNivel: "", psaiData: "", companyTest: "", psaiTestDomain: "", psaiDominioLocalEmpresa: "", psaiDominioWebEmpresa: "", psaiDominioLocalRepro: false, psaiDominioWebRepro: false, psaiCompanySentEsocial: false, psaiTestCertificate: "", psaiTestPassword: "", psaiPausadoPor: "", psaiReuniaoDuvida: "", neStatus: "", obs: "", saiGenerated: "", saiStatus: "", saiChangeLevel: "", saiScore: "", saiData: "", saiPriority: "", saiPrazo: "", saiAssunto: "", saiObs: "", ssNumero: "", ssData: "", status: "Em definição", priority: "null", deadline: "", links: [], ssTramites: [], researchByTopic: { saiLiberadas: [], ne: [], outros: [] }, managerReviews: [], tests: "", solution: "", createdBy: un, lastModifiedBy: un };
    cases.push(c);
    saveData(true);
    loadCase(c.id);
}

function saveData(silent) {
    silent = silent === true;
    var un = (currentUser && currentUser.username) ? currentUser.username : '';
    if (currentId) { var c = cases.find(function(x) { return x.id === currentId; }); if (c) { c.lastUpdated = Date.now(); c.lastModifiedBy = un; if (!c.createdBy) c.createdBy = un; } }
    function afterSave() {
        renderSidebar(); if (currentId && !silent) analyzeData(currentId);
        if (!silent) { ['btn-save-gen', 'btn-save-tech'].forEach(function(id) { var btn = getEl(id); if (btn) { var orig = btn.innerText; btn.innerText = 'SALVO!'; setTimeout(function() { btn.innerText = orig; }, 1500); } }); }
        var indicator = getEl('save-status'); if (indicator) { indicator.style.opacity = '1'; setTimeout(function() { indicator.style.opacity = '0'; }, 2000); }
    }
    storageSet({ 'myCasesV14': JSON.stringify(cases) }, function() {
        afterSave();
        writeBackupToFolder();
    });
}

function triggerAutoSave() { saveCurrentCaseMemory(); renderSidebar(); clearTimeout(autoSaveTimer); autoSaveTimer = setTimeout(() => { saveData(true); }, 1000); }

function deleteCase() {
    if (!currentId || !confirm('Excluir análise permanentemente?')) return;
    var idToRemove = currentId;
    cases = cases.filter(function(c) { return c.id !== currentId; });
    groups.forEach(function(g) { if (g.caseIds) g.caseIds = g.caseIds.filter(function(cid) { return cid !== idToRemove; }); });
    saveData();
    saveGroups();
    var contentArea = getEl('content-area');
    var emptyState = getEl('empty-state');
    if (contentArea) contentArea.classList.remove('content-area-visible');
    if (emptyState) emptyState.classList.remove('hidden');
    currentId = null;
    renderSidebar();
}

function statusForCase(c) {
    var wt = c.workType || 'PSAI';
    if (wt === 'SAI') return c.saiStatus || c.status || '';
    if (wt === 'SS') return c.ssStatus || c.status || '';
    if (wt === 'NE') return c.neStatus || c.status || '';
    return c.status || '';
}
function renderSidebar() {
    var list = getEl('case-list'); if (!list) return; list.innerHTML = '';
    var filtered = workTypeFilter === 'all' ? cases : cases.filter(function(c) { return (c.workType || 'PSAI') === workTypeFilter; });
    var sorted = filtered.slice().sort(function(a, b) {
        var statusA = statusForCase(a);
        var statusB = statusForCase(b);
        if (statusA === 'Levar na Reunião de Dúvidas' && statusB !== 'Levar na Reunião de Dúvidas') return -1;
        if (statusA !== 'Levar na Reunião de Dúvidas' && statusB === 'Levar na Reunião de Dúvidas') return 1;
        var isPrescritaA = statusA === 'Prescrita';
        var isPrescritaB = statusB === 'Prescrita';
        if (isPrescritaA && !isPrescritaB) return 1;
        if (!isPrescritaA && isPrescritaB) return -1;
        var isFinishedA = statusA && statusA !== 'Prescrita' && (statusA.indexOf('Concluído') !== -1 || statusA.indexOf('Reprovada') !== -1 || statusA.indexOf('Concluída') !== -1);
        var isFinishedB = statusB && statusB !== 'Prescrita' && (statusB.indexOf('Concluído') !== -1 || statusB.indexOf('Reprovada') !== -1 || statusB.indexOf('Concluída') !== -1);
        if (isFinishedA && !isFinishedB) return 1;
        if (!isFinishedA && isFinishedB) return -1;
        var priOrder = function(p) { return (p === 'Alta' ? 0 : (p === 'Media' ? 1 : (p === 'Baixa' ? 2 : 3))); };
        var pa = priOrder(a.priority);
        var pb = priOrder(b.priority);
        if (pa !== pb) return pa - pb;
        return (b.lastUpdated || b.id) - (a.lastUpdated || a.id);
    });
    sorted.forEach(function(c) {
        var item = document.createElement('div');
        var wt = c.workType || 'PSAI';
        var statusForBadge = statusForCase(c);
        var tagText = (statusForBadge && statusForBadge.trim()) ? statusForBadge.trim() : 'Em definição';
        if (tagText.length > 22) tagText = tagText.substring(0, 20) + '\u2026';
        var isConcluido = statusForBadge && (statusForBadge.indexOf('Concluído') !== -1 || statusForBadge.indexOf('Reprovada') !== -1 || statusForBadge.indexOf('Concluída') !== -1);
        var isPrescrita = statusForBadge === 'Prescrita';
        var isUrgente = c.priority === 'Alta' || (statusForBadge && (statusForBadge.indexOf('Urgente') !== -1 || statusForBadge === 'Levar na Reunião de Dúvidas'));
        var isEmDefinicao = statusForBadge === 'Em definição';
        var isFila = statusForBadge === 'Fila';
        var isAguard = statusForBadge && (statusForBadge.indexOf('Aguard. Consultoria') !== -1 || statusForBadge.indexOf('Aguardando resposta do Especialista') !== -1 || statusForBadge.indexOf('Aguardando Unidade') !== -1);
        var barClass = isPrescrita ? 'bar-prescrita' : (isConcluido ? 'bar-concluido' : (isUrgente ? 'bar-urgente' : (isEmDefinicao ? 'bar-em-definicao' : (isFila ? 'bar-fila' : (isAguard ? 'bar-aguard' : 'bar-definicao')))));
        var tagClass = isPrescrita ? 'tag-prescrita' : (isConcluido ? 'tag-concluido' : (isUrgente ? 'tag-urgente' : (isEmDefinicao ? 'tag-em-definicao' : (isFila ? 'tag-fila' : (isAguard ? 'tag-aguard' : 'tag-definicao')))));
        var desc = (c.title || 'Sem título');
        if (desc.length > 38) desc = desc.substring(0, 37) + '...';
        var displayId = getCaseDisplayId(c);
        var tipoLabel = ((isConcluido || isPrescrita) && (c.caseType || '').trim()) ? ' <span class="case-item-tipo" style="font-size:10px; color:var(--text-secondary);"> · ' + escapeHtml((c.caseType || '').trim()) + '</span>' : '';
        item.className = 'case-item ' + barClass + ' ' + (c.id === currentId ? 'active' : '');
        item.innerHTML = '<div class="case-item-body"><div class="case-item-id">' + escapeHtml(displayId) + '</div><div class="case-item-desc">' + escapeHtml(desc) + tipoLabel + '</div></div><span class="case-item-tag ' + tagClass + '">' + escapeHtml(tagText) + '</span>';
        item.addEventListener('click', function() { loadCase(c.id); });
        list.appendChild(item);
    });
    renderGroupsList();
}

function loadCase(id) {
    currentId = id;
    var c = cases.find(function(x) { return x.id === id; });
    if (!c) return;
    var emptyState = getEl('empty-state');
    var contentArea = getEl('content-area');
    if (emptyState) emptyState.classList.add('hidden');
    if (contentArea) contentArea.classList.add('content-area-visible');
    var btnGeneral = getEl('btn-tab-general');
    if (btnGeneral && !document.querySelector('.modal.visible')) btnGeneral.click();
    var scrollContainer = document.querySelector('.scroll-container');
    if (scrollContainer) scrollContainer.scrollTop = 0;

    setVal('input-work-type', c.workType || 'PSAI');
    setVal('input-title', c.title); setVal('input-type', c.caseType); setVal('input-psai-desc', c.psaiDesc); setVal('input-obs', c.obs); setVal('input-sai-generated', c.saiGenerated);
    setVal('input-psai-dominio', c.psaiTestDomain || '');
    setVal('input-psai-dominio-local-empresa', c.psaiDominioLocalEmpresa || '');
    setVal('input-psai-dominio-web-empresa', c.psaiDominioWebEmpresa || '');
    setCheck('input-psai-dominio-local-repro', c.psaiDominioLocalRepro);
    setCheck('input-psai-dominio-web-repro', c.psaiDominioWebRepro);
    setCheck('input-psai-esocial', c.psaiCompanySentEsocial);
    setVal('input-psai-certificado', c.psaiTestCertificate || '');
    setVal('input-psai-senha-cert', c.psaiTestPassword || '');
    document.querySelectorAll('.psai-dominio-btn').forEach(function(btn) {
        var d = (btn.getAttribute('data-dominio') || '').trim();
        var v = (c.psaiTestDomain || '').trim();
        var hasLocal = v.indexOf('Local') !== -1;
        var hasWeb = v.indexOf('Web') !== -1;
        btn.classList.toggle('active', (d === 'Local' && hasLocal) || (d === 'Web' && hasWeb));
    });
    setVal('input-sai-level', c.saiChangeLevel || ''); setVal('input-sai-score', c.saiScore !== undefined && c.saiScore !== '' ? c.saiScore : ''); setVal('input-sai-status', c.saiStatus || ''); setVal('input-sai-data', c.saiData || ''); setVal('input-sai-priority', c.saiPriority || ''); setVal('input-sai-prazo', c.saiPrazo || ''); setVal('input-sai-assunto', c.saiAssunto || ''); setVal('input-sai-obs', c.saiObs || '');
    var psaiNivelVal = c.psaiNivel || ''; if (psaiNivelVal === 'Baixa') psaiNivelVal = 'Pequena'; else if (psaiNivelVal === 'Alta') psaiNivelVal = 'Grande'; setVal('input-psai-link', getPsaiCode(c.psaiLink) || ''); setVal('input-psai-nivel', psaiNivelVal); setVal('input-psai-data', c.psaiData || ''); setVal('input-status', c.status || 'Em definição'); setVal('input-priority', c.priority || 'null'); setVal('input-deadline', c.deadline);
    setVal('input-psai-pausado-por', c.psaiPausadoPor || ''); setVal('input-psai-reuniao-duvida', c.psaiReuniaoDuvida || '');
    togglePsaiStatusExtras();
    setVal('input-ss-numero', c.ssNumero || ''); setVal('input-ss-data', c.ssData || '');
    setVal('input-ss-subtopico', c.ssSubtopic || ''); setVal('input-ss-assunto', c.ssAssunto); setVal('input-ss-problema', c.ssProblema); setVal('input-ss-passos', c.ssPassos);
    setVal('input-ss-detalhe-tecnico', c.ssDetalheTecnico || '');
    setVal('input-ss-status', c.ssStatus || 'Em análise'); setVal('input-ss-complexidade', c.ssComplexidade || 'Média');
    setVal('input-ss-proximo-passo', c.ssProximoPasso || ''); setVal('input-ss-apoio', c.ssApoio || ''); setVal('input-ss-sa-ne-codigo', c.ssSaNeCodigo || ''); setVal('input-ss-validado-com', c.ssValidadoCom || ''); setVal('input-ss-validado-data', c.ssValidadoData || '');
    setCheck('input-ss-banco-cliente', c.ssBancoCliente); setVal('input-ss-banco-cliente-conteudo', c.ssBancoClienteConteudo || '');
    if (c.workType === 'NE') {
        setVal('input-ne-title', c.title || '');
        setVal('input-ne-type', c.caseType || '');
        setVal('input-ne-status', c.neStatus || '');
        setVal('input-ne-priority', c.priority || 'null');
        setVal('input-ne-deadline', c.deadline || '');
    }
    toggleSsSaNeCodigoVisibility();
    toggleBancoClienteConteudoVisibility();
    var tramitesBadge = getEl('ss-tramites-badge');
    if (tramitesBadge) { var n = c.ssTramitesCount || 0; tramitesBadge.textContent = n + (n === 1 ? ' Trâmite' : ' Trâmites'); tramitesBadge.style.display = n > 0 ? '' : 'none'; }
    updateSsTitleAuto(c);

    setHTML('input-tests', c.tests);
    setHTML('input-solution', c.solution);

    if (!c.researchByTopic && c.researchLinks) { c.researchByTopic = { saiLiberadas: [], ne: [], outros: (c.researchLinks || []).slice() }; }
    renderResearch(c.researchByTopic);
    renderManagerReviews(c.managerReviews || []);
    switchMainPanel(c.workType || 'PSAI');
    renderTramitesList(c.ssTramites || []);
    analyzeData(id);
    renderSidebar();
}

function saveCurrentCaseMemory() {
    if (!currentId) return;
    var c = cases.find(function(x) { return x.id === currentId; });
    if (!c) return;

    c.workType = getVal('input-work-type') || 'PSAI';
    c.title = getVal('input-title'); c.caseType = getVal('input-type'); c.psaiDesc = getVal('input-psai-desc'); c.obs = getVal('input-obs'); c.saiGenerated = getVal('input-sai-generated');
    if (c.workType === 'PSAI' || c.workType === 'SS') {
        var localBtn = getEl('input-psai-dominio') && document.querySelector('.psai-dominio-btn[data-dominio="Local"]');
        var webBtn = document.querySelector('.psai-dominio-btn[data-dominio="Web"]');
        var hasLocal = localBtn && localBtn.classList.contains('active');
        var hasWeb = webBtn && webBtn.classList.contains('active');
        c.psaiTestDomain = (hasLocal && hasWeb) ? 'Local e Web' : (hasLocal ? 'Local' : (hasWeb ? 'Web' : ''));
        c.psaiDominioLocalEmpresa = getVal('input-psai-dominio-local-empresa') || '';
        c.psaiDominioWebEmpresa = getVal('input-psai-dominio-web-empresa') || '';
        c.psaiDominioLocalRepro = !!getEl('input-psai-dominio-local-repro') && getEl('input-psai-dominio-local-repro').checked;
        c.psaiDominioWebRepro = !!getEl('input-psai-dominio-web-repro') && getEl('input-psai-dominio-web-repro').checked;
        c.psaiCompanySentEsocial = !!getEl('input-psai-esocial') && getEl('input-psai-esocial').checked;
        c.psaiTestCertificate = getVal('input-psai-certificado') || '';
        c.psaiTestPassword = getVal('input-psai-senha-cert') || '';
        c.psaiPausadoPor = getVal('input-psai-pausado-por') || '';
        c.psaiReuniaoDuvida = getVal('input-psai-reuniao-duvida') || '';
    }
    c.saiChangeLevel = getVal('input-sai-level');
    var scoreVal = getVal('input-sai-score'); c.saiScore = scoreVal === '' ? '' : (isNaN(parseFloat(scoreVal)) ? '' : parseFloat(scoreVal)); c.saiStatus = getVal('input-sai-status');
    c.saiData = getVal('input-sai-data'); c.saiPriority = getVal('input-sai-priority'); c.saiPrazo = getVal('input-sai-prazo'); c.saiAssunto = getVal('input-sai-assunto'); c.saiObs = getVal('input-sai-obs');
    var psaiCode = getPsaiCode(getVal('input-psai-link')); c.psaiLink = psaiCode ? ('https://sgd.dominiosistemas.com.br/sgsa/faces/psai.html?psai=' + psaiCode) : ''; c.psaiNivel = getVal('input-psai-nivel'); c.psaiData = getVal('input-psai-data'); if (c.workType !== 'NE') c.status = getVal('input-status'); c.priority = getVal('input-priority'); c.deadline = getVal('input-deadline');
    if (c.workType === 'NE') {
        c.title = getVal('input-ne-title') || '';
        c.caseType = getVal('input-ne-type') || '';
        c.neStatus = getVal('input-ne-status') || '';
        c.priority = getVal('input-ne-priority') || 'null';
        c.deadline = getVal('input-ne-deadline') || '';
    }
    c.ssNumero = getVal('input-ss-numero'); c.ssData = getVal('input-ss-data');
    c.ssSubtopic = getVal('input-ss-subtopico'); c.ssAssunto = getVal('input-ss-assunto'); c.ssProblema = getVal('input-ss-problema'); c.ssPassos = getVal('input-ss-passos');
    c.ssDetalheTecnico = getVal('input-ss-detalhe-tecnico');
    c.ssBancoCliente = !!getEl('input-ss-banco-cliente')?.checked; c.ssBancoClienteConteudo = getVal('input-ss-banco-cliente-conteudo');
    c.ssStatus = getVal('input-ss-status'); c.ssComplexidade = getVal('input-ss-complexidade');
    if (c.ssTramites && c.ssTramites.length) c.ssResumoAI = c.ssTramites.map(function(t) { return (t.date ? t.date + ' - ' : '') + (t.user ? t.user + ': ' : '') + (t.desc || '—'); }).join('\n');
    c.ssProximoPasso = getVal('input-ss-proximo-passo'); c.ssApoio = getVal('input-ss-apoio'); c.ssSaNeCodigo = getVal('input-ss-sa-ne-codigo'); c.ssValidadoCom = getVal('input-ss-validado-com'); c.ssValidadoData = getVal('input-ss-validado-data');

    c.tests = getHTML('input-tests');
    c.solution = getHTML('input-solution');

    c.researchByTopic = c.researchByTopic || { saiLiberadas: [], ne: [], outros: [] };
    ['sai', 'ne', 'outros'].forEach(function(topic) {
        var key = RESEARCH_TOPIC_KEYS[topic];
        c.researchByTopic[key] = [];
        document.querySelectorAll('#research-container-' + topic + ' .link-row').forEach(function(row) {
            var link = (row.querySelector('.link-url') || {}).value || '';
            var desc = (row.querySelector('.link-desc') || {}).value || '';
            if (link || desc) c.researchByTopic[key].push({ link: link, desc: desc });
        });
    });

    c.managerReviews = [];
    document.querySelectorAll('#manager-reviews-container .manager-row').forEach(function(row) {
        var date = (row.querySelector('.manager-date') || {}).value || '';
        var who = (row.querySelector('.manager-who') || {}).value || '';
        var reason = (row.querySelector('.manager-reason') || {}).value || '';
        if (date || who || reason) c.managerReviews.push({ date: date, who: who, reason: reason });
    });
}

function saveCurrentCase() { saveCurrentCaseMemory(); saveData(false); }

/** Se houver HTML pendente do botão flutuante "Ler SS", carrega o caso e preenche todos os campos. */
function tryApplyPendingSS() {
    storageGet(['pendingSSHtml', 'pendingSSCaseId', 'myCasesV14'], function(r) {
        if (!r.pendingSSHtml || !r.pendingSSCaseId) return;
        if (r.myCasesV14) { try { cases = JSON.parse(r.myCasesV14); } catch (e) {} }
        var id = r.pendingSSCaseId;
        if (!cases.some(function(c) { return c.id === id; })) return;
        loadCase(id);
        var data = parseSSHtml(r.pendingSSHtml);
        applyParsedSS(data);
        storageRemove(['pendingSSHtml', 'pendingSSCaseId']);
        renderSidebar();
    });
}

function switchMainPanel(workType) {
    var wt = (workType || 'PSAI').toString();
    document.querySelectorAll('.panel-general').forEach(function(p) { p.classList.remove('active'); });
    var panel = getEl('psai-painel');
    if (wt === 'SS') panel = getEl('ss-painel');
    else if (wt === 'SAI') panel = getEl('sai-painel');
    else if (wt === 'NE') panel = getEl('ne-painel');
    if (panel) panel.classList.add('active');
    var ctxWrap = getEl('contexto-resumo-wrapper');
    if (ctxWrap) ctxWrap.style.display = (wt === 'PSAI' || wt === 'SS') ? 'block' : 'none';
    var addLabel = getEl('contexto-resumo-label');
    var countLabel = getEl('contexto-resumo-count-label');
    if (addLabel) addLabel.textContent = wt === 'SS' ? 'Adicionar SSC' : 'Adicionar SA';
    if (countLabel) countLabel.textContent = wt === 'SS' ? 'SSCs' : 'SAs';
    var ssOnlyBlock = getEl('tab-technical-ss-only');
    if (ssOnlyBlock) ssOnlyBlock.style.display = wt === 'SS' ? 'block' : 'none';
    var psaiDominioWrap = getEl('psai-empresa-dominio-wrap');
    var psaiEsocialCard = getEl('psai-esocial-card');
    if (psaiDominioWrap) psaiDominioWrap.style.display = (wt === 'PSAI' || wt === 'SS') ? 'block' : 'none';
    document.querySelectorAll('.dominio-repro-label').forEach(function(el) { el.style.display = wt === 'SS' ? 'flex' : 'none'; });
    if (psaiEsocialCard) psaiEsocialCard.style.display = wt === 'PSAI' ? 'block' : 'none';
    if (wt === 'PSAI') togglePsaiStatusExtras();
    if (wt === 'SS') toggleSsSaNeCodigoVisibility();
}

function togglePsaiStatusExtras() {
    var statusEl = getEl('input-status');
    var pausadoWrap = getEl('psai-pausado-wrap');
    var reuniaoWrap = getEl('psai-reuniao-duvida-wrap');
    if (!statusEl) return;
    var v = (statusEl.value || '').trim();
    if (pausadoWrap) pausadoWrap.style.display = (v === 'Pausado') ? 'block' : 'none';
    if (reuniaoWrap) reuniaoWrap.style.display = (v === 'Levar na Reunião de Dúvidas') ? 'block' : 'none';
}

function toggleSsSaNeCodigoVisibility() {
    var sel = getEl('input-ss-proximo-passo');
    var wrap = getEl('ss-sa-ne-codigo-wrap');
    var label = getEl('ss-sa-ne-codigo-label');
    var input = getEl('input-ss-sa-ne-codigo');
    if (!sel || !wrap) return;
    var v = (sel.value || '').trim();
    var show = v === 'Cadastro de SA' || v === 'Cadastro de NE' || v === 'Cadastro de SA/NE';
    wrap.style.display = show ? 'block' : 'none';
    if (label) label.textContent = v === 'Cadastro de SA' ? 'Código da SA criada' : v === 'Cadastro de NE' ? 'Código da NE criada' : show ? 'Código da SA/NE criada' : 'Código da SA/NE criada';
    if (input) input.placeholder = v === 'Cadastro de SA' ? 'Ex: 420056' : v === 'Cadastro de NE' ? 'Ex: 12345' : show ? 'Ex: SA 420056 / NE 12345' : 'Ex: 420056';
}

function toggleBancoClienteConteudoVisibility() {
    var cb = getEl('input-ss-banco-cliente');
    var wrap = getEl('ss-banco-cliente-conteudo-wrap');
    if (!cb || !wrap) return;
    wrap.style.display = cb.checked ? 'block' : 'none';
}

function updateSsTitleAuto(c) {
    var el = getEl('ss-title-auto');
    if (!el) return;
    var n = (c && c.ssNumero) ? String(c.ssNumero).trim() : '';
    var t = (c && c.ssTipo) ? String(c.ssTipo).trim() : '';
    var s = (c && c.ssSubtopic) ? String(c.ssSubtopic).trim() : '';
    var parts = [n, t, s].filter(Boolean);
    el.textContent = parts.length ? parts.join(' · ') : '—';
}

/** Gera um breve resumo do conteúdo dos trâmites (quantidade, período, trecho do conteúdo). */
function buildTramitesBriefSummary(tramites) {
    if (!tramites || tramites.length === 0) return '';
    var n = tramites.length;
    var dates = tramites.map(function(t) { return (t.date || '').trim(); }).filter(Boolean);
    var period = '';
    if (dates.length > 0) {
        var first = dates[0];
        var last = dates[dates.length - 1];
        period = first === last ? 'Período: ' + first + '.' : 'Período: ' + first + ' a ' + last + '.';
    }
    var allDesc = tramites.map(function(t) { return (t.desc || '').replace(/\s+/g, ' ').trim(); }).filter(Boolean).join(' ');
    var excerpt = allDesc.length > 0 ? allDesc.replace(/\s+/g, ' ') : '';
    var line1 = n === 1 ? '1 trâmite.' : n + ' trâmites.';
    if (period) line1 += ' ' + period;
    if (!excerpt) return line1;
    return line1 + '<br><span style="color:var(--text-primary);">Resumo:</span> ' + excerpt.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Renderiza a lista de trâmites no card Contexto & Resumo (cada trâmite em um card distinto). */
function renderTramitesList(tramites) {
    var container = getEl('tramites-list');
    var summaryEl = getEl('tramites-brief-summary');
    if (summaryEl) {
        if (!tramites || tramites.length === 0) { summaryEl.innerHTML = ''; summaryEl.style.display = 'none'; }
        else { summaryEl.innerHTML = buildTramitesBriefSummary(tramites); summaryEl.style.display = 'block'; }
    }
    if (!container) return;
    if (!tramites || tramites.length === 0) {
        container.innerHTML = '<div class="summary-empty" style="color:var(--text-secondary); font-size:12px;">Nenhum trâmite. Use "Ler da Aba Aberta" na SS para importar.</div>';
        return;
    }
    var html = '';
    tramites.forEach(function(t, idx) {
        var date = (t.date || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        var user = (t.user || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        var desc = (t.desc || '—').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        var headerLabel = 'Trâmite ' + (idx + 1) + (date || user ? ' — ' + (date ? date + (user ? ' · ' : '') : '') + (user || '') : '');
        html += '<div class="summary-block" style="margin-bottom:12px;">';
        html += '<div class="summary-header normal">' + headerLabel + '</div>';
        html += '<div class="summary-content" style="padding:10px; white-space:normal;">' + (user ? '<div style="font-size:11px; color:var(--text-secondary); margin-bottom:6px;">' + user + '</div>' : '') + '<div class="summary-sa-text">' + desc + '</div></div>';
        html += '</div>';
    });
    container.innerHTML = html;
}

/** Extrai trâmites da seção TRÂMITES do HTML da SS (tabelas com âncoras tramite01, tramite02, etc.). */
function parseTramitesFromDoc(doc) {
    var out = { count: 0, summary: '', tramites: [] };
    var anchors = doc.querySelectorAll('a[name^="tramite"]');
    if (!anchors.length) return out;
    var lines = [];
    for (var i = 0; i < anchors.length; i++) {
        var table = anchors[i].closest('table.tableVisualizacao');
        if (!table) continue;
        var dateStr = '';
        var userStr = '';
        var descStr = '';
        var destaqueTds = table.querySelectorAll('td.tableVisualizacaoDestaque');
        for (var d = 0; d < destaqueTds.length; d++) {
            var txt = getElementText(destaqueTds[d]);
            if (txt.indexOf('Data:') !== -1) {
                var dateMatch = txt.match(/(\d{2})\/(\d{2})\/(\d{2})/);
                if (dateMatch) dateStr = dateMatch[1] + '/' + dateMatch[2];
                break;
            }
        }
        for (var u = 0; u < destaqueTds.length; u++) {
            var utxt = getElementText(destaqueTds[u]);
            if (utxt.indexOf('Usuário:') !== -1) {
                userStr = utxt.replace(/^\s*Usuário:\s*/i, '').trim();
                break;
            }
        }
        var justifyDiv = table.querySelector('div[align="justify"]');
        if (justifyDiv) descStr = getElementTextWithBreaks(justifyDiv);
        else { var tdHtml = table.querySelector('td.tableVisualizacaoHtml'); if (tdHtml) descStr = getElementTextWithBreaks(tdHtml); }
        descStr = (descStr || '').trim();
        out.tramites.push({ date: dateStr, user: userStr, desc: descStr });
        var block = (dateStr ? '[' + dateStr + ']' : '') + (dateStr && (userStr || descStr) ? ' - ' : '') + (userStr ? '[' + userStr + ']:' : '') + (userStr && descStr ? '\n' : '') + (descStr || '—');
        lines.push(block);
    }
    out.count = out.tramites.length;
    out.summary = lines.join('\n----------------\n');
    return out;
}

function parseSSHtml(html) {
    if (!html || typeof html !== 'string') return {};
    var out = {};
    var urlNumero = (function() {
        var match = html.match(/\bss\.html\?ss=(\d+)/i) || html.match(/[?&]ss=(\d+)/i);
        return match ? match[1] : null;
    })();
    if (urlNumero) out.numero = urlNumero;

    var doc = new DOMParser().parseFromString(html, 'text/html');
    var tramitesData = parseTramitesFromDoc(doc);
    out.tramitesCount = tramitesData.count;
    out.tramitesSummary = tramitesData.summary;
    out.tramites = tramitesData.tramites;
    var allTd = doc.querySelectorAll('td.tableVisualizacaoField');
    for (var i = 0; i < allTd.length; i++) {
        var txt = getElementText(allTd[i]);
        if (!out.numero && txt.indexOf('Número:') === 0) { var m = txt.match(/Número:\s*(\d+)/); if (m) out.numero = m[1]; }
        if (txt.indexOf('Subtópico:') !== -1) { out.subtopic = txt.replace(/^\s*Subtópico:\s*/i, '').trim(); }
        if (txt.indexOf('Tipo:') !== -1) { out.tipo = txt.replace(/^\s*Tipo:\s*/i, '').trim(); }
        if (txt.indexOf('Data:') !== -1) {
            var dataMatch = txt.match(/Data:\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
            if (dataMatch) out.ssData = parsePsaiDateToISO(dataMatch[1] + '/' + dataMatch[2] + '/' + dataMatch[3]);
        }
    }
    if (!out.ssData && html) {
        var dataFromRaw = html.match(/Data:[\s\S]*?(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
        if (dataFromRaw) out.ssData = parsePsaiDateToISO(dataFromRaw[1] + '/' + dataFromRaw[2] + '/' + dataFromRaw[3]);
    }
    var destaque = doc.querySelectorAll('td.tableVisualizacaoDestaque');
    for (var di = 0; di < destaque.length; di++) {
        var dtxt = getElementText(destaque[di]);
        if (dtxt.indexOf('Situação:') !== -1 && !out.tipo) { out.tipo = dtxt.replace(/^\s*Situação:\s*/i, '').trim(); break; }
    }
    var htmlCells = doc.querySelectorAll('td.tableVisualizacaoHtml');
    for (var j = 0; j < destaque.length; j++) {
        var label = getElementText(destaque[j]);
        if (label.indexOf('Assunto:') !== -1 && htmlCells[j] !== undefined) { out.assunto = getElementText(htmlCells[j]); continue; }
        if (label.indexOf('Descreva de forma detalhada') !== -1 && htmlCells[j] !== undefined) { out.problema = getElementText(htmlCells[j]); continue; }
        if (label.indexOf('Passos para reproduzir') !== -1 && htmlCells[j] !== undefined) { out.passos = getElementText(htmlCells[j]); continue; }
        if (label.indexOf('Situação ocorre apenas no Banco de Dados do Cliente') !== -1) {
        if (htmlCells[j] !== undefined) out.bancoCliente = /sim/i.test(getElementText(htmlCells[j]));
        else {
            var trBanco = destaque[j].closest('tr');
            if (trBanco) { var tdSim = trBanco.querySelector('td.tableVisualizacaoHtml'); if (tdSim) out.bancoCliente = /sim/i.test(getElementText(tdSim)); }
        }
        continue;
    }
        if (label.toLowerCase().indexOf('detalhamento') !== -1 && htmlCells[j] !== undefined) {
            out.detalheTecnico = getElementTextWithBreaks(htmlCells[j]);
            continue;
        }
    }
    var rows = doc.querySelectorAll('tr');
    for (var r = 0; r < rows.length; r++) {
        var rowText = getElementText(rows[r]);
        if (rowText.indexOf('Assunto:') !== -1 && rows[r + 1]) {
            var nextCell = rows[r + 1].querySelector('td.tableVisualizacaoHtml');
            if (nextCell) out.assunto = getElementText(nextCell);
        }
        if (rowText.indexOf('Descreva de forma detalhada') !== -1 && rows[r + 1]) {
            var nextCell2 = rows[r + 1].querySelector('td.tableVisualizacaoHtml');
            if (nextCell2) out.problema = getElementText(nextCell2);
        }
        if (rowText.indexOf('Passos para reproduzir') !== -1 && rows[r + 1]) {
            var nextCell3 = rows[r + 1].querySelector('td.tableVisualizacaoHtml');
            if (nextCell3) out.passos = getElementText(nextCell3);
        }
        if (rowText.indexOf('Situação ocorre apenas no Banco de Dados do Cliente') !== -1) {
            function cellHasSim(td) {
                if (!td) return false;
                var t = getElementText(td).replace(/\s+/g, ' ').trim();
                return /^sim$/i.test(t);
            }
            var cellSim = rows[r].querySelector('td.tableVisualizacaoHtml');
            if (cellSim) out.bancoCliente = cellHasSim(cellSim);
            if (out.bancoCliente !== true && rows[r + 1]) {
                var nextCell4 = rows[r + 1].querySelector('td.tableVisualizacaoHtml');
                if (nextCell4) out.bancoCliente = cellHasSim(nextCell4);
            }
            if (out.bancoCliente !== true) {
                var tdsRow = rows[r].querySelectorAll('td');
                for (var ti = 0; ti < tdsRow.length; ti++) { if (cellHasSim(tdsRow[ti])) { out.bancoCliente = true; break; } }
            }
            if (out.bancoCliente !== true && rows[r + 1]) {
                var tdsNext = rows[r + 1].querySelectorAll('td');
                for (var tj = 0; tj < tdsNext.length; tj++) { if (cellHasSim(tdsNext[tj])) { out.bancoCliente = true; break; } }
            }
        }
        if (rowText.indexOf('SSC(s):') !== -1) {
            var links = rows[r].querySelectorAll('a[href*="ssc="]');
            out.sscs = [];
            links.forEach(function(a) {
                var href = a.getAttribute('href') || '';
                var code = getElementText(a) || (href.match(/ssc=(\d+)/) && href.match(/ssc=(\d+)/)[1]);
                if (code) out.sscs.push({ code: String(code).trim(), link: a.href || '', desc: '' });
            });
        }
        if (!out.detalheTecnico && rowText.toLowerCase().indexOf('detalhamento') !== -1) {
            var tdDet = rows[r].querySelector('td.tableVisualizacaoHtml');
            if (!tdDet && rows[r + 1]) tdDet = rows[r + 1].querySelector('td.tableVisualizacaoHtml');
            if (tdDet) out.detalheTecnico = getElementTextWithBreaks(tdDet);
        }
    }
    var colspanCells = doc.querySelectorAll('td.tableVisualizacaoHtml[colspan="3"]');
    if (!out.detalheTecnico) {
        for (var k = 0; k < colspanCells.length; k++) {
            var t = getElementTextWithBreaks(colspanCells[k]);
            if (t.length > 80 && (t.indexOf('- ') !== -1 || t.indexOf('/unidades/') !== -1 || t.indexOf('sgd.dominiosistemas.com.br') !== -1)) {
                out.detalheTecnico = t;
                break;
            }
        }
    }
    if (!out.assunto && destaque.length) {
        for (var d = 0; d < destaque.length; d++) {
            if (getElementText(destaque[d]).indexOf('Assunto:') !== -1) {
                var next = destaque[d].parentElement && destaque[d].parentElement.nextElementSibling;
                if (next) { var cell = next.querySelector('td.tableVisualizacaoHtml'); if (cell) out.assunto = getElementText(cell); }
                break;
            }
        }
    }
    if (!out.problema)
        for (var d2 = 0; d2 < destaque.length; d2++) {
            if (getElementText(destaque[d2]).indexOf('Descreva de forma detalhada') !== -1) {
                var next2 = destaque[d2].parentElement && destaque[d2].parentElement.nextElementSibling;
                if (next2) { var cell2 = next2.querySelector('td.tableVisualizacaoHtml'); if (cell2) out.problema = getElementText(cell2); }
                break;
            }
        }
    if (!out.passos)
        for (var d3 = 0; d3 < destaque.length; d3++) {
            if (getElementText(destaque[d3]).indexOf('Passos para reproduzir') !== -1) {
                var next3 = destaque[d3].parentElement && destaque[d3].parentElement.nextElementSibling;
                if (next3) { var cell3 = next3.querySelector('td.tableVisualizacaoHtml'); if (cell3) out.passos = getElementText(cell3); }
                break;
            }
        }
    if (out.bancoCliente === undefined) {
        for (var d4 = 0; d4 < destaque.length; d4++) {
            if (getElementText(destaque[d4]).indexOf('Banco de Dados do Cliente') !== -1) {
                var row4 = destaque[d4].closest('tr');
                if (row4) {
                    var cell4 = row4.querySelector('td.tableVisualizacaoHtml');
                    if (cell4) out.bancoCliente = /sim/i.test(getElementText(cell4));
                }
                if (out.bancoCliente === undefined && row4 && row4.nextElementSibling) {
                    var nextRow = row4.nextElementSibling;
                    cell4 = nextRow.querySelector('td.tableVisualizacaoHtml');
                    if (cell4) out.bancoCliente = /sim/i.test(getElementText(cell4));
                }
                break;
            }
        }
    }
    if (out.bancoCliente === undefined) {
        for (var iField = 0; iField < allTd.length; iField++) {
            var lbl = getElementText(allTd[iField]);
            if (lbl.indexOf('Banco de Dados do Cliente') !== -1) {
                var rowField = allTd[iField].closest('tr');
                if (rowField) {
                    var cellSimR = rowField.querySelector('td.tableVisualizacaoHtml');
                    if (cellSimR) out.bancoCliente = /sim/i.test(getElementText(cellSimR));
                }
                if (out.bancoCliente === undefined && rowField && rowField.nextElementSibling) {
                    cellSimR = rowField.nextElementSibling.querySelector('td.tableVisualizacaoHtml');
                    if (cellSimR) out.bancoCliente = /sim/i.test(getElementText(cellSimR));
                }
                break;
            }
        }
    }
    if (out.bancoCliente === undefined) {
        var allHtmlTds = doc.querySelectorAll('td.tableVisualizacaoHtml');
        for (var ti = 0; ti < allHtmlTds.length; ti++) {
            var txtSim = getElementText(allHtmlTds[ti]).replace(/\s+/g, ' ').trim();
            if (/^sim$/i.test(txtSim)) { out.bancoCliente = true; break; }
        }
    }
    if (!out.bancoClienteConteudo) {
        var infoBancoRow = null;
        for (var ib = 0; ib < destaque.length; ib++) {
            if (getElementText(destaque[ib]).indexOf('Informações do Banco de Dados') !== -1) {
                infoBancoRow = destaque[ib].closest('tr');
                break;
            }
        }
        if (!infoBancoRow && allTd.length) {
            for (var iIB = 0; iIB < allTd.length; iIB++) {
                if (getElementText(allTd[iIB]).indexOf('Informações do Banco de Dados') !== -1) {
                    infoBancoRow = allTd[iIB].closest('tr');
                    break;
                }
            }
        }
        if (infoBancoRow && infoBancoRow.nextElementSibling) {
            var nextTr = infoBancoRow.nextElementSibling;
            var tdInfo = nextTr.querySelector('td.tableVisualizacaoHtml[colspan="3"]');
            if (tdInfo) out.bancoClienteConteudo = getElementTextWithBreaks(tdInfo);
        }
    }
    if (out.bancoCliente === undefined && html) {
        var idxBanco = html.indexOf('Banco de Dados do Cliente');
        if (idxBanco !== -1) {
            var bloco = html.substring(idxBanco, idxBanco + 800);
            if (/>\s*Sim\s*<\s*\/\s*td/i.test(bloco) || /tableVisualizacaoHtml[\s\S]*?>\s*Sim\s*</i.test(bloco)) out.bancoCliente = true;
        }
    }
    if (!out.bancoClienteConteudo && html) {
        var idxInfoBanco = html.indexOf('Informações do Banco de Dados');
        if (idxInfoBanco !== -1) {
            var afterLabel = html.substring(idxInfoBanco);
            var idxCloseTr = afterLabel.indexOf('</tr>');
            var afterRow = idxCloseTr !== -1 ? afterLabel.substring(idxCloseTr + 5) : afterLabel;
            var reColspan3 = /<td[^>]*class="[^"]*tableVisualizacaoHtml[^"]*"[^>]*colspan="3"[^>]*>([\s\S]*?)<\/td>/i;
            var mInfo = reColspan3.exec(afterRow);
            if (mInfo && mInfo[1]) {
                out.bancoClienteConteudo = (mInfo[1] || '')
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/<[^>]+>/g, '')
                    .replace(/&nbsp;/gi, ' ')
                    .replace(/\n\s*\n/g, '\n')
                    .trim();
            }
        }
    }
    return out;
}

function _ssEmpty(val) {
    if (val == null || val === undefined) return true;
    if (typeof val === 'string') return (val.trim && val.trim()) === '';
    if (Array.isArray(val)) return val.length === 0;
    return false;
}

function applyParsedSS(data) {
    if (!currentId) return;
    var c = cases.find(function(x) { return x.id === currentId; });
    if (!c) return;
    var titleParts = [];
    if (data.numero && _ssEmpty(c.ssNumero)) { c.ssNumero = data.numero; setVal('input-ss-numero', data.numero); }
    if (data.ssData && _ssEmpty(c.ssData)) { c.ssData = data.ssData; setVal('input-ss-data', data.ssData); }
    if (data.subtopic && _ssEmpty(c.ssSubtopic)) { c.ssSubtopic = data.subtopic; setVal('input-ss-subtopico', data.subtopic); }
    if (data.tipo !== undefined && _ssEmpty(c.ssTipo)) c.ssTipo = data.tipo;
    titleParts = [c.ssNumero, c.ssTipo, c.ssSubtopic].filter(Boolean);
    if (titleParts.length) { var autoTitle = titleParts.join(' · '); setVal('input-title', autoTitle); c.title = autoTitle; }
    if (data.assunto && _ssEmpty(c.ssAssunto)) { c.ssAssunto = data.assunto; setVal('input-ss-assunto', data.assunto); }
    if (data.problema && _ssEmpty(c.ssProblema)) { c.ssProblema = data.problema; setVal('input-ss-problema', data.problema); }
    if (data.passos && _ssEmpty(c.ssPassos)) { c.ssPassos = data.passos; setVal('input-ss-passos', data.passos); }
    if (data.bancoCliente !== undefined) { c.ssBancoCliente = !!data.bancoCliente; setCheck('input-ss-banco-cliente', data.bancoCliente); }
    if (data.bancoClienteConteudo != null && _ssEmpty(c.ssBancoClienteConteudo)) { c.ssBancoClienteConteudo = data.bancoClienteConteudo; setVal('input-ss-banco-cliente-conteudo', data.bancoClienteConteudo); }
    toggleBancoClienteConteudoVisibility();
    if (data.detalheTecnico != null && _ssEmpty(c.ssDetalheTecnico)) { c.ssDetalheTecnico = data.detalheTecnico; setVal('input-ss-detalhe-tecnico', data.detalheTecnico); }
    if (data.tramites && data.tramites.length && _ssEmpty(c.ssTramites)) {
        c.ssTramites = data.tramites.slice();
        c.ssTramitesCount = data.tramites.length;
        c.ssResumoAI = (data.tramitesSummary || '').trim() || data.tramites.map(function(t) { return (t.date ? t.date + ' - ' : '') + (t.user ? t.user + ': ' : '') + (t.desc || '—'); }).join('\n');
        renderTramitesList(c.ssTramites);
    } else renderTramitesList(c.ssTramites || []);
    if (data.tramitesCount != null && (c.ssTramitesCount == null || c.ssTramitesCount === undefined)) c.ssTramitesCount = data.tramitesCount;
    var badge = getEl('ss-tramites-badge');
    if (badge) {
        var n = c.ssTramitesCount != null ? c.ssTramitesCount : 0;
        badge.textContent = n + (n === 1 ? ' Trâmite' : ' Trâmites');
        badge.style.display = n > 0 ? '' : 'none';
    }
    if (data.sscs && data.sscs.length) {
        c.links = (c.links || []).slice();
        data.sscs.forEach(function(item) {
            if (item.code && !c.links.some(function(l) { return l.code === item.code; })) c.links.push({ code: item.code, link: item.link || '', desc: item.desc || '' });
        });
    }
    updateSsTitleAuto(c);
    saveData(true);
    analyzeData(currentId);
}

/** Converte dd/mm/yy ou dd/mm/yyyy para yyyy-mm-dd (ISO para input type="date"). */
function parsePsaiDateToISO(str) {
    if (!str || typeof str !== 'string') return '';
    var m = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (!m) return '';
    var d = parseInt(m[1], 10), mon = parseInt(m[2], 10), y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    return y + '-' + ('0' + mon).slice(-2) + '-' + ('0' + d).slice(-2);
}

/** Extrai dados da PSAI a partir de HTML (ou link). Retorna { codigo, link, nivel, data, psaiDesc, caseType }. */
function parsePsaiHtml(htmlOrLink) {
    var raw = (htmlOrLink || '').trim();
    var out = { codigo: '', link: '', nivel: '', data: '', psaiDesc: '', caseType: '' };
    var mLink = raw.match(/psai\.html\?psai=(\d+)/i) || raw.match(/[?&]psai=(\d+)/i) || raw.match(/(?:psai|id)=(\d+)/i) || raw.match(/(\d{5,})/);
    if (mLink) {
        out.codigo = mLink[1];
        if (raw.indexOf('http') === 0) out.link = raw;
        else if (raw.indexOf('<') === -1) out.link = 'https://sgd.dominiosistemas.com.br/sgsa/faces/psai.html?psai=' + out.codigo;
    }
    if (raw.indexOf('<') === -1) return out;
    var doc = new DOMParser().parseFromString(raw, 'text/html');
    if (!out.codigo) {
        var a = doc.querySelector('a[href*="psai="]');
        if (a) { var h = (a.getAttribute('href') || ''); var mm = h.match(/psai=(\d+)/i); if (mm) out.codigo = mm[1]; }
        if (!out.codigo) { var bodyText = (doc.body && doc.body.innerText) || ''; var mx = bodyText.match(/PSAI\s*[:\-#]?\s*(\d+)/i); if (mx) out.codigo = mx[1]; }
    }
    var allB = doc.querySelectorAll('b');
    for (var bi = 0; bi < allB.length; bi++) {
        var bText = (allB[bi].textContent || '').trim();
        if (/Nível da alteração:/i.test(bText)) {
            var parent = allB[bi].parentElement;
            var fullText = parent ? (parent.innerText || parent.textContent || '').trim() : '';
            var nivelVal = fullText.replace(/Nível da alteração:\s*/i, '').trim().split(/\s+/)[0] || '';
            if (nivelVal) out.nivel = nivelVal;
            break;
        }
    }
    var tds = doc.querySelectorAll('td.tableVisualizacaoField');
    for (var i = 0; i < tds.length; i++) {
        var txt = getElementText(tds[i]);
        if (txt.indexOf('Data:') !== -1) {
            var dateMatch = txt.match(/Data:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
            if (dateMatch && dateMatch[1]) { out.data = parsePsaiDateToISO(dateMatch[1]); break; }
        }
        if (txt.indexOf('Tipo:') !== -1) { out.caseType = txt.replace(/^\s*Tipo:\s*/i, '').trim(); }
    }
    var divJustify = doc.querySelector('div[align="justify"]');
    if (divJustify) out.psaiDesc = (divJustify.innerText || divJustify.textContent || '').trim().replace(/\s+/g, ' ');
    return out;
}

function applyParsedPsai(data) {
    if (!currentId) return;
    var c = cases.find(function(x) { return x.id === currentId; });
    if (!c) return;
    if (data.codigo) { setVal('input-psai-link', data.codigo); c.psaiLink = 'https://sgd.dominiosistemas.com.br/sgsa/faces/psai.html?psai=' + data.codigo; }
    if (data.nivel) { setVal('input-psai-nivel', data.nivel); c.psaiNivel = data.nivel; }
    if (data.data) { setVal('input-psai-data', data.data); c.psaiData = data.data; }
    if (data.psaiDesc) { setVal('input-psai-desc', data.psaiDesc); c.psaiDesc = data.psaiDesc; }
    if (data.caseType) { setVal('input-type', data.caseType); c.caseType = data.caseType; }
    saveData(true);
    analyzeData(currentId);
}

// RENDERIZADORES
function addSaFromForm() {
    if (!currentId) return;
    var code = getVal('new-sa-code').trim();
    var link = getVal('new-sa-url').trim();
    var desc = getVal('new-sa-desc').trim();
    if (!code && !desc) return;
    var c = cases.find(function(x) { return x.id === currentId; });
    if (!c) return;
    if (!c.links) c.links = [];
    c.links.push({ code: code, link: link, desc: desc });
    setVal('new-sa-code', ''); setVal('new-sa-url', ''); setVal('new-sa-desc', '');
    saveData(true);
    analyzeData(currentId);
}

var RESEARCH_TOPIC_KEYS = { sai: 'saiLiberadas', ne: 'ne', outros: 'outros' };
function renderResearch(topics) {
    topics = topics || { saiLiberadas: [], ne: [], outros: [] };
    ['sai', 'ne', 'outros'].forEach(function(topic) {
        var key = RESEARCH_TOPIC_KEYS[topic];
        var container = getEl('research-container-' + topic);
        if (!container) return;
        container.innerHTML = '';
        var list = topics[key];
        if (list && list.length > 0) { list.forEach(function(l) { addResearchRow(l.link, l.desc, false, topic); }); }
        else addResearchRow('', '', false, topic);
    });
}

function addResearchRow(link, desc, prepend, topic) {
    link = link || ''; desc = desc || ''; prepend = prepend !== false; topic = topic || 'outros';
    var container = getEl('research-container-' + topic);
    if (!container) return;
    var div = document.createElement('div');
    div.className = 'link-row';
    var iconOpen = '<svg viewBox="0 0 24 24" class="icon-outline" stroke-width="1.5" style="width:14px;height:14px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>';
    div.innerHTML = '<div class="link-row-top"><input type="text" class="link-url" placeholder="Cole o Link aqui..." value="' + (link + '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '" style="flex:1;"><button class="open-link-btn" title="Abrir" type="button">' + iconOpen + '</button><button class="remove-btn" type="button">' + _iconCloseSvg + '</button></div><div class="link-row-bottom"><input type="text" class="link-desc" placeholder="Assunto / Título..." value="' + (desc + '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '" style="width:100%;"></div>';
    div.querySelectorAll('input').forEach(function(inp) { inp.addEventListener('input', triggerAutoSave); });
    if (prepend) container.prepend(div);
    else container.appendChild(div);
}

function renderManagerReviews(reviews) {
    var container = getEl('manager-reviews-container'); if (!container) return; container.innerHTML = '';
    if (reviews && reviews.length > 0) { reviews.forEach(r => addManagerReviewRow(r.date, r.who, r.reason, false)); } else addManagerReviewRow('', '', '', false);
}

var _iconCloseSvg = '<svg viewBox="0 0 24 24" class="icon-outline" stroke-width="1.5" style="width:14px;height:14px;"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>';
function addManagerReviewRow(date = '', who = '', reason = '', prepend = true) {
    var container = getEl('manager-reviews-container'); if (!container) return;
    const div = document.createElement('div'); div.className = 'manager-row';
    div.innerHTML = '<div class="manager-header"><input type="date" class="manager-date" value="' + (date || '').replace(/"/g, '&quot;') + '"><input type="text" class="manager-who" placeholder="Com quem?" value="' + (who || '').replace(/"/g, '&quot;') + '"><button class="remove-btn" style="width:24px; height:24px;" type="button">' + _iconCloseSvg + '</button></div><textarea class="manager-reason" placeholder="Motivo / O que foi conversado..." style="width:100%; min-height:40px; resize:vertical;">' + (reason || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</textarea>';
    div.querySelectorAll('input, textarea').forEach(inp => inp.addEventListener('input', triggerAutoSave));
    div.querySelector('.remove-btn').addEventListener('click', function() { div.remove(); triggerAutoSave(); });
    if(prepend) container.prepend(div); else container.appendChild(div);
}

// --- UTILS ---
function toggleModal(id, show) { var modal = getEl(id); if (modal) { if (show) modal.classList.add('visible'); else modal.classList.remove('visible'); } }

function openCalendar() {
    var listArea = getEl('calendar-list-area');
    if(!listArea) return;
    listArea.innerHTML = '';
    const withDeadline = cases.filter(c => c.deadline && c.deadline.includes('-'));
    withDeadline.sort((a,b) => new Date(a.deadline) - new Date(b.deadline));
    if (withDeadline.length === 0) { listArea.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-secondary);">Sem prazos definidos.</div>'; } else {
        const today = new Date(); today.setHours(0,0,0,0);
        withDeadline.forEach(c => {
            const dateParts = c.deadline.split('-'); const d = new Date(dateParts[0], dateParts[1]-1, dateParts[2]);
            const diffDays = Math.ceil((d - today) / (1000 * 60 * 60 * 24)); 
            let statusClass = 'd-future'; let statusText = `${diffDays} dias restantes`;
            if (diffDays < 0) { statusClass = 'd-expired'; statusText = `Vencido há ${Math.abs(diffDays)} dias`; }
            else if (diffDays === 0) { statusClass = 'd-today'; statusText = 'Vence HOJE'; }
            else if (diffDays === 1) { statusClass = 'd-today'; statusText = 'Vence Amanhã'; }
            const item = document.createElement('div'); item.className = 'deadline-item';
            item.innerHTML = `<span class="deadline-date ${statusClass}">${dateParts[2]}/${dateParts[1]} - ${statusText}</span><div class="deadline-title">${c.title}</div>`;
            item.onclick = () => { loadCase(c.id); toggleModal('modal-calendar', false); };
            listArea.appendChild(item);
        });
    }
    toggleModal('modal-calendar', true);
}

function getCaseDisplayId(c) {
    var wt = c.workType || 'PSAI';
    var code = '';
    if (wt === 'SS') {
        if (c.ssNumero) code = String(c.ssNumero).replace(/\D/g, '');
        if (!code && c.psaiLink) { var mSs = c.psaiLink.match(/[?&]ss=(\d+)/i); if (mSs) code = mSs[1]; }
    } else if (wt === 'SAI') {
        if (c.saiGenerated) code = String(c.saiGenerated).replace(/\D/g, '');
        if (!code && c.psaiLink) { var mSai = c.psaiLink.match(/[?&]sai=(\d+)/i); if (mSai) code = mSai[1]; }
    } else if (wt === 'NE') {
        code = String(c.id).slice(-6);
    } else {
        if (c.psaiLink) { var m = c.psaiLink.match(/(?:psai|id)=(\d+)/i) || c.psaiLink.match(/(\d{5,})/); if (m) code = m[1]; }
    }
    if (!code) code = String(c.id).slice(-6);
    return wt + ' ' + code;
}

function renderSearchResults(query) {
    var container = getEl('search-results');
    if (!container) return;
    if (query === undefined) {
        var qEl = getEl('search-query');
        query = qEl ? (qEl.value || '').trim() : '';
    } else {
        query = (query || '').trim();
    }
    var filterDate = (getEl('search-filter-date') && getEl('search-filter-date').value) || '';
    var filterStatus = (getEl('search-filter-status') && getEl('search-filter-status').value) || '';
    var filterPriority = (getEl('search-filter-priority') && getEl('search-filter-priority').value) || '';

    var filtered = cases;
    if (query) {
        var q = query.toLowerCase();
        filtered = filtered.filter(function(c) {
            var id = getCaseDisplayId(c);
            var title = (c.title || '').toLowerCase();
            var desc = (c.psaiDesc || c.ssAssunto || c.obs || '').toLowerCase();
            var link = (c.psaiLink || '').toLowerCase();
            return id.toLowerCase().indexOf(q) !== -1 || title.indexOf(q) !== -1 || desc.indexOf(q) !== -1 || link.indexOf(q) !== -1;
        });
    }
    if (filterDate) {
        filtered = filtered.filter(function(c) {
            var d = (c.deadline || '').trim() || (c.workType === 'PSAI' ? (c.psaiData || '') : c.workType === 'SS' ? (c.ssData || '') : (c.deadline || '')).trim();
            return d && d.indexOf(filterDate) === 0;
        });
    }
    if (filterStatus) {
        filtered = filtered.filter(function(c) {
            var s = statusForCase(c) || '';
            return s === filterStatus;
        });
    }
    if (filterPriority) {
        filtered = filtered.filter(function(c) {
            var p = (c.priority || '').toString();
            if (filterPriority === 'null') return !p || p === 'null' || p === '';
            return p === filterPriority;
        });
    }

    if (!query && !filterDate && !filterStatus && !filterPriority) {
        filtered = cases.slice(0, 20);
    }

    container.innerHTML = '';
    if (filtered.length === 0) {
        var msg = query ? 'Nenhum resultado para "' + (query.replace(/</g, '&lt;')) + '".' : 'Nenhum resultado com os filtros aplicados.';
        if (filterDate || filterStatus || filterPriority) msg = 'Nenhum resultado com os filtros aplicados.';
        container.innerHTML = '<div style="padding:16px; color:var(--text-secondary); text-align:center;">' + msg + '</div>';
        return;
    }
    filtered.forEach(function(c) {
        var item = document.createElement('div');
        item.className = 'search-result-item';
        var id = getCaseDisplayId(c);
        var desc = (c.title || 'Sem título').replace(/</g, '&lt;');
        if (desc.length > 50) desc = desc.substring(0, 49) + '…';
        item.innerHTML = '<span class="sr-id">' + id.replace(/</g, '&lt;') + '</span><span class="sr-desc">' + desc + '</span>';
        item.addEventListener('click', function() { loadCase(c.id); toggleModal('modal-search', false); var ca = getEl('content-area'); var es = getEl('empty-state'); if (ca) ca.classList.add('content-area-visible'); if (es) es.classList.add('hidden'); });
        container.appendChild(item);
    });
}

function openSearchModal() {
    toggleModal('modal-search', true);
    var input = getEl('search-query');
    if (input) { input.value = ''; input.focus(); }
    var dateEl = getEl('search-filter-date');
    var statusEl = getEl('search-filter-status');
    var priorityEl = getEl('search-filter-priority');
    if (dateEl) dateEl.value = '';
    if (statusEl) statusEl.value = '';
    if (priorityEl) priorityEl.value = '';
    renderSearchResults('');
}

function exportSingleCase() { if(!currentId) return; const c = cases.find(x => x.id === currentId); const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(c)); const dl = document.createElement('a'); dl.setAttribute("href", dataStr); dl.setAttribute("download", `Analise_${c.title}.json`); document.body.appendChild(dl); dl.click(); dl.remove(); }
function copyContextoResumoContent() {
    if (!currentId) return;
    var parts = [];
    var sumEl = getEl('tramites-brief-summary');
    if (sumEl && sumEl.innerText) parts.push(sumEl.innerText.trim());
    var listEl = getEl('tramites-list');
    if (listEl && listEl.innerText) parts.push(listEl.innerText.trim());
    var areaEl = getEl('summary-area');
    if (areaEl && areaEl.innerText) parts.push(areaEl.innerText.trim());
    var text = parts.filter(Boolean).join('\n\n');
    if (!text) text = 'Nenhum conteúdo.';
    navigator.clipboard.writeText(text).then(function() { alert('Conteúdo (Contexto & Resumo) copiado!'); }).catch(function() { alert('Erro ao copiar.'); });
}

function copyTechnicalData() {
    if (!currentId) return;
    saveCurrentCaseMemory();
    var c = cases.find(function(x) { return x.id === currentId; });
    if (!c) return;

    var wt = c.workType || 'PSAI';
    var visaoTitles = [];
    var visaoLines = [];
    visaoTitles.push('Título: ' + (c.title || ''));
    visaoLines.push('Título: ' + (c.title || ''));
    visaoTitles.push('Tipo: ' + (c.caseType || ''));
    visaoLines.push('Tipo: ' + (c.caseType || ''));
    if (wt === 'SS') {
        visaoLines.push('Cód. SS: ' + (c.ssNumero || '')); visaoLines.push('Status: ' + (c.ssStatus || '')); visaoLines.push('Data: ' + (c.ssData || ''));
        visaoLines.push('Subtópico: ' + (c.ssSubtopic || '')); visaoLines.push('Assunto: ' + (c.ssAssunto || '')); visaoLines.push('Observações/Problema: ' + (c.ssProblema || '').replace(/\n/g, '\n  '));
        visaoLines.push('Passos para Reproduzir: ' + (c.ssPassos || '').replace(/\n/g, '\n  ')); visaoLines.push('Banco apenas do Cliente: ' + (c.ssBancoCliente ? 'Sim' : 'Não'));
        visaoLines.push('Detalhamento técnico: ' + (c.ssDetalheTecnico || '').replace(/\n/g, '\n  ')); visaoLines.push('Próximo Passo: ' + (c.ssProximoPasso || '')); visaoLines.push('Integração/Apoio: ' + (c.ssApoio || ''));
    } else if (wt === 'PSAI') {
        visaoLines.push('Cód. PSAI: ' + (getPsaiCode(c.psaiLink) || '')); visaoLines.push('Nível: ' + (c.psaiNivel || '')); visaoLines.push('Data: ' + (c.psaiData || ''));
        visaoLines.push('Descrição: ' + (c.psaiDesc || '').replace(/\n/g, '\n  ')); visaoLines.push('Status: ' + (c.status || '')); visaoLines.push('Prioridade: ' + (c.priority || ''));
    } else if (wt === 'SAI') {
        visaoLines.push('Cód. SAI: ' + (c.saiGenerated || '')); visaoLines.push('Nível: ' + (c.saiChangeLevel || '')); visaoLines.push('Data: ' + (c.saiData || ''));
        visaoLines.push('Status: ' + (c.saiStatus || '')); visaoLines.push('Assunto: ' + (c.saiAssunto || '')); visaoLines.push('Observações: ' + (c.saiObs || '').replace(/\n/g, '\n  '));
    }
    var visaoPlain = visaoLines.join('\n');
    var visaoHtml = '<div style="margin-bottom:16px;"><b style="color:#fa6400">VISÃO GERAL</b><br>' + visaoLines.map(function(l) { return escapeHtml(l); }).join('<br>') + '</div>';

    var ctxParts = [];
    var sumEl = getEl('tramites-brief-summary');
    if (sumEl && sumEl.innerText) ctxParts.push(sumEl.innerText.trim());
    var listEl = getEl('tramites-list');
    if (listEl && listEl.innerText) ctxParts.push(listEl.innerText.trim());
    var areaEl = getEl('summary-area');
    if (areaEl && areaEl.innerText) ctxParts.push(areaEl.innerText.trim());
    var contextoPlain = ctxParts.filter(Boolean).join('\n\n') || '—';
    var contextoHtml = '<div style="margin-bottom:16px;"><b style="color:#fa6400">CONTEXTO &amp; RESUMO</b><br><pre style="white-space:pre-wrap; font-family:inherit; margin:0;">' + escapeHtml(contextoPlain) + '</pre></div>';

    var elTests = getEl('input-tests');
    var elSolution = getEl('input-solution');
    var testsHTML = elTests ? (elTests.innerHTML || '').trim() : '';
    var solutionHTML = elSolution ? (elSolution.innerHTML || '').trim() : '';
    var testsPlain = elTests ? (elTests.innerText || '').trim() : '';
    var solutionPlain = elSolution ? (elSolution.innerText || '').trim() : '';

    function linkLine(url, desc, useBoldDash) {
        if (!url) return '•  – ' + escapeHtml(desc || '');
        var safeUrl = (url || '').trim().replace(/"/g, '&quot;');
        var text = escapeHtml((desc || url).trim());
        if (useBoldDash) return '• <a href="' + safeUrl + '" target="_blank"><b> – ' + text + '</b></a>';
        return '•  <a href="' + safeUrl + '" target="_blank"> ' + text + '</a>';
    }
    function mapLinks(list, useBoldDash) {
        return (list || []).map(function(r) { return linkLine(r.link, r.desc, useBoldDash); }).join('<br>');
    }

    var researchByTopic = c.researchByTopic || { saiLiberadas: [], ne: [], outros: [] };
    var saiHtml = mapLinks(researchByTopic.saiLiberadas, false);
    var neHtml = mapLinks(researchByTopic.ne, false);
    var outrosHtml = mapLinks(researchByTopic.outros, true);
    if (!saiHtml) saiHtml = '•  – ';
    if (!neHtml) neHtml = '•  – ';
    if (!outrosHtml) outrosHtml = '•  – ';

    var reviewsForAvaliado = c.managerReviews && c.managerReviews.length ? c.managerReviews : [];
    if (!reviewsForAvaliado.length) {
        document.querySelectorAll('#manager-reviews-container .manager-row').forEach(function(row) {
            var date = (row.querySelector('.manager-date') || {}).value || '';
            var who = (row.querySelector('.manager-who') || {}).value || '';
            var reason = (row.querySelector('.manager-reason') || {}).value || '';
            if (date || who || reason) reviewsForAvaliado.push({ date: date, who: who, reason: reason });
        });
    }
    var avaliadoLines = reviewsForAvaliado.map(function(r) {
        var who = (r.who || '').trim();
        var reason = (r.reason || '').trim();
        return '• [' + formatDateDDMMAAAA(r.date) + '] Avaliado com: ' + escapeHtml(who) + (reason ? ' – ' + escapeHtml(reason) : '');
    });
    var validadoComVal = getVal('input-ss-validado-com');
    var avaliadoHtml = avaliadoLines.length ? avaliadoLines.join('<br>') : '';
    if (!avaliadoHtml && validadoComVal) {
        avaliadoHtml = '• [' + formatDateDDMMAAAA(new Date()) + '] Avaliado com: ' + escapeHtml(validadoComVal);
    }

    var formData = {
        testesRealizados: testsHTML || testsPlain.replace(/\n/g, '<br>') || 'N/A',
        solucaoFinal: solutionHTML || solutionPlain.replace(/\n/g, '<br>') || 'Em análise'
    };
    var dominioPartsHtml = [];
    var dominioPartsPlain = [];
    if (c.psaiTestDomain) {
        if (c.psaiTestDomain.indexOf('Local') !== -1) { dominioPartsHtml.push('Domínio Local: ' + escapeHtml(c.psaiDominioLocalEmpresa || '') + (c.psaiDominioLocalRepro ? ' — Reproduzido no banco de teste' : '')); dominioPartsPlain.push('Domínio Local: ' + (c.psaiDominioLocalEmpresa || '') + (c.psaiDominioLocalRepro ? ' — Reproduzido no banco de teste' : '')); }
        if (c.psaiTestDomain.indexOf('Web') !== -1) { dominioPartsHtml.push('Domínio Web: ' + escapeHtml(c.psaiDominioWebEmpresa || '') + (c.psaiDominioWebRepro ? ' — Reproduzido no banco de teste' : '')); dominioPartsPlain.push('Domínio Web: ' + (c.psaiDominioWebEmpresa || '') + (c.psaiDominioWebRepro ? ' — Reproduzido no banco de teste' : '')); }
    }
    var empresaTesteHtml = dominioPartsHtml.length ? dominioPartsHtml.join('<br>') : escapeHtml(c.companyTest || '');
    var empresaTestePlain = dominioPartsPlain.length ? dominioPartsPlain.join('\n') : (c.companyTest || '');

    var techHtml = `<div style="margin-bottom:16px;"><span style="color:#fa6400"><strong>DETALHAMENTO TÉCNICO</strong></span><br>
  <strong>Empresa de teste:</strong><br>${empresaTesteHtml}<br><br>
  <strong>Testes realizados:</strong><br>${formData.testesRealizados}<br><br>
  <strong>Pesquisas &amp; Referências:</strong><br><strong>SAI's liberadas:</strong><br>${saiHtml}<br><strong>NE:</strong><br>${neHtml}<br><strong>Outros links:</strong><br>${outrosHtml}<br><br>
  <strong>Avaliado com:</strong><br>${avaliadoHtml}<br><br><strong>Solução final:</strong><br>${formData.solucaoFinal}</div>`;

    var plainPesquisas = "SAI's liberadas:\n" + (researchByTopic.saiLiberadas || []).map(function(r) { return '• ' + (r.link || '') + (r.desc ? ' – ' + r.desc : ''); }).join('\n') +
        "\nNE:\n" + (researchByTopic.ne || []).map(function(r) { return '• ' + (r.link || '') + (r.desc ? ' – ' + r.desc : ''); }).join('\n') +
        "\nOutros links:\n" + (researchByTopic.outros || []).map(function(r) { return '• ' + (r.link || '') + (r.desc ? ' – ' + r.desc : ''); }).join('\n');
    var plainAvaliado = reviewsForAvaliado.length ? reviewsForAvaliado.map(function(r) {
        return '• [' + formatDateDDMMAAAA(r.date) + '] Avaliado com: ' + (r.who || '') + (r.reason ? ' – ' + r.reason : '');
    }).join('\n') : (validadoComVal ? '• [' + formatDateDDMMAAAA(new Date()) + '] Avaliado com: ' + validadoComVal : '');
    var techPlain = `EMPRESA DE TESTE:\n${empresaTestePlain}\n\nTESTES REALIZADOS:\n${testsPlain}\n\nPESQUISAS & REFERÊNCIAS:\n${plainPesquisas}\n\nAVALIADO COM:\n${plainAvaliado}\n\nSOLUÇÃO FINAL:\n${solutionPlain}`;

    var htmlContent = '<div style="font-family: Arial, sans-serif; font-size: 11pt; color: #000000;">' + visaoHtml + contextoHtml + techHtml + '</div>';
    var plainText = '========== VISÃO GERAL ==========\n' + visaoPlain + '\n\n========== CONTEXTO & RESUMO ==========\n' + contextoPlain + '\n\n========== DETALHAMENTO TÉCNICO ==========\n' + techPlain;

    var testsClean = (testsPlain || 'N/A').replace(/\n/g, '<br>');
    var solutionClean = (solutionPlain || 'Em análise').replace(/\n/g, '<br>');
    function linkLinePlain(list) {
        return (list || []).map(function(r) { return '• ' + (r.link || '') + (r.desc ? ' – ' + r.desc : ''); }).join('<br>');
    }
    var saiPlain = linkLinePlain(researchByTopic.saiLiberadas) || '•  – ';
    var nePlain = linkLinePlain(researchByTopic.ne) || '•  – ';
    var outrosPlain = linkLinePlain(researchByTopic.outros) || '•  – ';
    var avaliadoPlain = reviewsForAvaliado.length ? reviewsForAvaliado.map(function(r) {
        return '• [' + formatDateDDMMAAAA(r.date) + '] Avaliado com: ' + (r.who || '') + (r.reason ? ' – ' + r.reason : '');
    }).join('<br>') : (validadoComVal ? '• [' + formatDateDDMMAAAA(new Date()) + '] Avaliado com: ' + validadoComVal : '');
    var techHtmlClean = '<strong>DETALHAMENTO TÉCNICO</strong><br><br><strong>Empresa de teste:</strong><br>' + empresaTesteHtml + '<br><br><strong>Testes realizados:</strong><br>' + testsClean + '<br><br><strong>Pesquisas & Referências:</strong><br><strong>SAI\'s liberadas:</strong><br>' + saiPlain + '<br><strong>NE:</strong><br>' + nePlain + '<br><strong>Outros links:</strong><br>' + outrosPlain + '<br><br><strong>Avaliado com:</strong><br>' + avaliadoPlain + '<br><br><strong>Solução final:</strong><br>' + solutionClean;
    var htmlForTextarea = techHtmlClean;

    var sep = '_____________________________________________________________________________________________________________________________________________________';
    var psaiAvaliadoLinesHtml = reviewsForAvaliado.length ? reviewsForAvaliado.map(function(r) {
        var d = formatDateDDMMAAAA(r.date);
        var who = escapeHtml((r.who || '').trim());
        var reason = (r.reason || '').trim();
        return '• <strong>[' + d + '] ' + who + '</strong>' + (reason ? ' – ' + escapeHtml(reason) : '');
    }).join('<br>') : (validadoComVal ? '• <strong>[' + formatDateDDMMAAAA(new Date()) + '] ' + escapeHtml(validadoComVal) + '</strong>' : '');
    var psaiAvaliadoLinesPlain = reviewsForAvaliado.length ? reviewsForAvaliado.map(function(r) {
        var d = formatDateDDMMAAAA(r.date);
        var who = (r.who || '').trim();
        var reason = (r.reason || '').trim();
        return '• <strong>[' + d + '] ' + who + '</strong>' + (reason ? ' – ' + reason : '');
    }).join('\n') : (validadoComVal ? '• <strong>[' + formatDateDDMMAAAA(new Date()) + '] ' + validadoComVal + '</strong>' : '');

    function psaiLinkFormatLiteral(list) {
        return (list || []).map(function(r) {
            var link = (r.link || '').trim().replace(/"/g, '&quot;');
            var titulo = (r.desc || r.link || '').trim();
            return '<A HREF = "' + link + '" target="_blank"><b> ' + titulo + ' </b></a>';
        }).join('\n');
    }
    function psaiLinkFormatLiteralHtml(list) {
        return (list || []).map(function(r) {
            var link = (r.link || '').trim().replace(/"/g, '&quot;');
            var titulo = escapeHtml((r.desc || r.link || '').trim());
            return '&lt;A HREF = "' + link + '" target="_blank"&gt;&lt;b&gt; ' + titulo + ' &lt;/b&gt;&lt;/a&gt;';
        }).join('<br>');
    }
    var psaiSaiLinks = psaiLinkFormatLiteralHtml(researchByTopic.saiLiberadas) || '–';
    var psaiNeLinks = psaiLinkFormatLiteralHtml(researchByTopic.ne) || '–';
    var psaiOutrosLinks = psaiLinkFormatLiteralHtml(researchByTopic.outros) || '–';
    var psaiSaiLinksPlain = psaiLinkFormatLiteral(researchByTopic.saiLiberadas);
    var psaiNeLinksPlain = psaiLinkFormatLiteral(researchByTopic.ne);
    var psaiOutrosLinksPlain = psaiLinkFormatLiteral(researchByTopic.outros);

    var psaiExtraLines = [];
    psaiExtraLines.push('Empresa enviada para eSocial: ' + (c.psaiCompanySentEsocial ? 'Sim' : 'Não'));
    if (c.psaiTestCertificate) psaiExtraLines.push('Certificado: ' + escapeHtml(c.psaiTestCertificate));
    if (c.psaiTestPassword) psaiExtraLines.push('Senha: ' + escapeHtml(c.psaiTestPassword));
    var psaiExtrasHtml = '<br>' + psaiExtraLines.join('<br>');
    var psaiExtrasPlain = '\n' + psaiExtraLines.map(function(l) { return l.replace(/<[^>]*>/g, ''); }).join('\n');

    var psaiTechHtml = sep + '<br><strong>EMPRESA TESTE</strong><br>' + empresaTesteHtml + psaiExtrasHtml + '<br><br>' + sep + '<br><strong>TESTES REALIZADOS</strong><br>' + testsClean + '<br><br>' + sep + '<br><strong>PESQUISAS & REFERÊNCIAS</strong><br><strong>SAI\'s liberadas:</strong><br>' + psaiSaiLinks + '<br><strong>NE:</strong><br>' + psaiNeLinks + '<br><strong>Outros links:</strong><br>' + psaiOutrosLinks + '<br><br>' + sep + '<br><strong>AVALIADO COM</strong><br>' + psaiAvaliadoLinesHtml + '<br><br>' + sep + '<br><strong>SOLUÇÃO FINAL</strong><br>' + solutionClean;
    var psaiPesquisasPlain = "SAI's liberadas:\n" + (psaiSaiLinksPlain || '–') + "\n\nNE:\n" + (psaiNeLinksPlain || '–') + "\n\nOutros links:\n" + (psaiOutrosLinksPlain || '–');
    var psaiTechPlain = sep + '\nEMPRESA TESTE\n' + empresaTestePlain + psaiExtrasPlain + '\n\n' + sep + '\nTESTES REALIZADOS\n' + testsPlain + '\n\n' + sep + '\nPESQUISAS & REFERÊNCIAS\n' + psaiPesquisasPlain + '\n\n' + sep + '\nAVALIADO COM\n' + psaiAvaliadoLinesPlain + '\n\n' + sep + '\nSOLUÇÃO FINAL\n' + solutionPlain;

    var copyListener = function(e) {
        e.preventDefault();
        if (e.clipboardData) {
            if (wt === 'PSAI') {
                e.clipboardData.setData('text/html', '<div style="font-family: Arial, sans-serif; font-size: 11pt;">' + psaiTechHtml + '</div>');
                e.clipboardData.setData('text/plain', psaiTechPlain);
            } else {
                e.clipboardData.setData('text/plain', plainText);
            }
        }
    };

    document.addEventListener('copy', copyListener);
    try {
        var successful = document.execCommand('copy');
        if (successful) {
            var msg = wt === 'PSAI' ? 'Detalhamento técnico copiado!' : 'Todo o conteúdo da página copiado!';
            if (typeof toast !== 'undefined' && toast.success) toast.success(msg);
            else alert(msg);
        } else {
            throw new Error('Comando de cópia falhou');
        }
    } catch (err) {
        console.error('Erro ao copiar:', err);
        alert('Erro ao copiar. Tente selecionar e copiar manualmente.');
    } finally {
        document.removeEventListener('copy', copyListener);
    }
}
// --- ANÁLISE INTELIGENTE (Contexto & Resumo) ---
const STOP_WORDS_PT = ['o','a','de','do','da','em','que','com','e','para','um','uma','dos','das','nos','nas','por','sem','sob','sobre','como','mais','mas','se','nao','na','no','ao','aos','as','os','ele','ela','isso','esse','esta','este','sao','foi','ser','sistema','solicitacao','solicitação','favor','verificar','informar','informação','campo','tela','tabela','quando','onde','apos','após','através','atraves','conforme','segue','seguir','realizar','realizado','correção','correcao','ajuste','ajustes','referente','referentes','problema','problemas','erro','erros','descrição','descricao','texto','valor','valores','dados','item','itens','caso','casos','pelo','pela','todo','toda','todos','todas','outro','outra','entre','ate','até','desde','durante','mediante','exceto','salvo','consoante','conforme','segundo','conta','fim','inicio','início','parte','modo','maneira','forma','tipo','tipos','numero','número','codigo','código','cod','cód','sigla','link','url','sa','sas'];
function normalizeForAnalysis(str) { return (str||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w\s]/g,' ').replace(/\s+/g,' ').trim(); }
function tokenize(str, minLen) { minLen = minLen || 3; const s = normalizeForAnalysis(str); return s ? s.split(/\s+/).filter(w => w.length >= minLen && !STOP_WORDS_PT.includes(w)) : []; }
function getTopContextWords(items, maxWords) { 
    const allText = items.map(i => i.desc).join(" "); 
    const words = tokenize(allText, 4); 
    const freq = {}; words.forEach(w => freq[w] = (freq[w] || 0) + 1); 
    return Object.entries(freq).sort((a,b) => b[1] - a[1]).slice(0, maxWords || 6).map(w => w[0]).join(", "); 
}
function getSimilarityScore(text1, text2) { 
    if(!text1 || !text2) return 0; 
    const set1 = new Set(tokenize(text1, 3)); 
    const set2 = new Set(tokenize(text2, 3)); 
    if (set1.size < 2 || set2.size < 2) return 0.5; 
    const intersection = new Set([...set1].filter(x => set2.has(x))); 
    const union = new Set([...set1, ...set2]); 
    return union.size ? intersection.size / union.size : 0; 
}
function getAverageCoherence(items) {
    if (!items || items.length < 2) return 1;
    let sum = 0, count = 0;
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) { sum += getSimilarityScore(items[i].desc, items[j].desc); count++; }
    return count ? sum / count : 1;
}

const ANALYSIS_CATEGORIES = {
    erros: { keywords: ['inconsistência','inconsistencia','travamento','lento','não funciona','nao funciona','crítico','critico','parou','mensagem de erro','falha','exceção','excecao','quebra','incorreto','inválido','invalido','bug','defeito','falha no','erro ao','erro no','não abre','nao abre','não grava','nao grava','travando','demora','timeout'], label: 'Erros / Correções', icon: '🚨' },
    melhorias: { keywords: ['implementar','novo','nova','criar opção','criar opcao','melhoria','melhorar','alterar','ajustar','inclusão','inclusao','novo campo','nova tela','nova funcionalidade','melhorar o','alteração','alteracao','inclusão de','inclusao de'], label: 'Melhorias / Evolutivos', icon: '✨' },
    duvidas: { keywords: ['dúvida','duvida','questionamento','esclarecimento','esclarecer','definir','definição','definicao','validar','confirmar','comportamento esperado','como deve'], label: 'Dúvidas / Escopo', icon: '❓' },
    relatorios: { keywords: ['relatório','relatorio','consulta','impressão','impressao','filtro','listagem','listar','pesquisa','busca','visualização','visualizacao','exportar','exportação','exportacao','imprimir','impressão'], label: 'Relatórios / Consultas', icon: '📊' },
    integracao: { keywords: ['integração','integracao','importação','importacao','exportação','exportacao','api','webservice','web service','integração com','integracao com','envio para','receber de'], label: 'Integração / Importação', icon: '🔗' },
    performance: { keywords: ['lentidão','lentidao','performance','demora','tempo de resposta','otimizar','otimização','otimizacao','lento','demorando'], label: 'Performance', icon: '⚡' },
    cadastro: { keywords: ['cadastro','registro','inclusão de','inclusao de','alteração de','alteracao de','exclusão','exclusao','manutenção','manutencao','crud','incluir','alterar','excluir'], label: 'Cadastro / Dados', icon: '📋' }
};

function classifyItem(desc) {
    const d = (desc || '').toLowerCase();
    for (const [key, cat] of Object.entries(ANALYSIS_CATEGORIES)) {
        if (cat.keywords.some(k => d.includes(k))) return key;
    }
    return 'outros';
}

function saLinkHtml(item) {
    const code = (item.code || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const url = (item.link || '').trim();
    if (url) return `<a href="${url.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" target="_blank" rel="noopener" class="summary-sa-link">${code}</a>`;
    return code;
}

function getCentralItem(items) {
    if (!items || items.length === 0) return null;
    if (items.length === 1) return items[0];
    let best = null, bestAvg = -1;
    items.forEach(cur => {
        let sum = 0, n = 0;
        items.forEach(other => { if (other !== cur) { sum += getSimilarityScore(cur.desc, other.desc); n++; } });
        const avg = n ? sum / n : 0;
        if (avg > bestAvg) { bestAvg = avg; best = cur; }
    });
    return best;
}

function getFirstPhrase(text, maxWords) {
    if (!text || !text.trim()) return '';
    maxWords = maxWords || 18;
    const t = text.trim().replace(/\s+/g, ' ');
    const match = t.match(new RegExp(`^[^.!?]*[.!?]?`, 'i'));
    let phrase = match ? match[0].trim() : t;
    const words = phrase.split(/\s+/);
    if (words.length > maxWords) phrase = words.slice(0, maxWords).join(' ') + (phrase.endsWith('.') ? '' : '…');
    return phrase;
}

function buildSuggestedReading(items, nature, topTopics, byCategory) {
    const central = getCentralItem(items);
    const parts = [];
    if (central && central.desc) {
        const phrase = getFirstPhrase(central.desc, 25);
        if (phrase) parts.push(`"${phrase}"`);
    }
    const focusParts = [];
    if (topTopics) focusParts.push(topTopics);
    focusParts.push(nature.toLowerCase());
    const sugestao = `Com base no que está escrito nas SAs: esta análise reúne ${items.length} solicitação(ões) com foco em ${focusParts.join(' — ')}.`;
    parts.push(sugestao);
    if (items.length >= 2) {
        const other = items.find(i => i !== central && (i.desc||'').trim().length > 30);
        if (other) {
            const extra = getFirstPhrase(other.desc, 14);
            if (extra && (!central || getFirstPhrase(central.desc, 10) !== getFirstPhrase(other.desc, 10))) parts.push(`Outro ponto: "${extra}"`);
        }
    }
    return parts.join(' ');
}

function analyzeData(id) {
    var c = cases.find(function(x) { return x.id === id; });
    if (!c) return;
    var summaryArea = getEl('summary-area');
    if (!summaryArea) return;
    var items = (c.links || []).filter(function(l) { return l.desc && l.desc.trim() !== ''; });
    var linkLabel = (c.workType === 'SS') ? 'SSC' : 'SA';
    var linkLabelPlural = (c.workType === 'SS') ? 'SSCs' : 'SAs';
    if (items.length === 0) { summaryArea.innerHTML = "<div class='summary-empty'>Nenhuma " + linkLabelPlural.toLowerCase() + " vinculada. Adicione " + linkLabelPlural + " para gerar a análise.</div>"; var sc = getEl('stats-count'); if (sc) sc.innerText = '0'; return; }

    const topTopics = getTopContextWords(items, 6);
    const coherence = getAverageCoherence(items);
    const byCategory = {};
    items.forEach(it => {
        const cat = classifyItem(it.desc);
        if (!byCategory[cat]) byCategory[cat] = []; byCategory[cat].push(it);
    });

    let divergentItem = null;
    if (items.length >= 2) { 
        let lowest = 1;
        items.forEach(cur => {
            let sum = 0, n = 0;
            items.forEach(other => { if (other !== cur) { sum += getSimilarityScore(cur.desc, other.desc); n++; } });
            const avg = n ? sum / n : 1;
            if (avg < lowest) { lowest = avg; divergentItem = cur; }
        });
        if (lowest >= 0.12) divergentItem = null;
    }

    const errors = byCategory.erros || [];
    const features = byCategory.melhorias || [];
    const others = byCategory.outros || [];
    const duvidas = byCategory.duvidas || [];
    const relatorios = byCategory.relatorios || [];
    const integracao = byCategory.integracao || [];
    const performance = byCategory.performance || [];
    const cadastro = byCategory.cadastro || [];

    const natureza = errors.length >= items.length / 2 ? 'Correção de erros' : features.length >= items.length / 2 ? 'Evolutivo / Melhorias' : errors.length + features.length > 0 ? 'Misto (erros e melhorias)' : 'Outros';
    const coerenciaLabel = coherence >= 0.25 ? 'Alta' : coherence >= 0.12 ? 'Média' : 'Baixa';
    const leituraSugerida = buildSuggestedReading(items, natureza, topTopics, byCategory);
    const pontosAtencao = [];
    if (divergentItem) pontosAtencao.push({ text: `A SA <strong>${saLinkHtml(divergentItem)}</strong> destoa do conjunto — verificar se pertence ao mesmo escopo.`, type: 'divergencia' });
    if (errors.length >= 3) pontosAtencao.push({ text: `Múltiplas SAs de correção (${errors.length}) — priorizar validação e testes.`, type: 'erro' });
    if (duvidas.length > 0) pontosAtencao.push({ text: `${duvidas.length} SA(s) com caráter de dúvida/escopo — alinhar expectativas.`, type: 'duvida' });
    if (items.length >= 5 && coherence < 0.2) pontosAtencao.push({ text: 'Conjunto abrange temas diversos — considerar quebrar em mais de uma análise?', type: 'escopo' });

    let html = '';

    const catCounts = [];
    ['erros','melhorias','duvidas','relatorios','integracao','performance','cadastro','outros'].forEach(catKey => {
        const list = byCategory[catKey]; if (!list || list.length === 0) return;
        const cat = ANALYSIS_CATEGORIES[catKey];
        const label = cat ? cat.label : 'Outros';
        catCounts.push(`${label}: ${list.length}`);
    });

    html += `<div class="summary-block summary-analysis"><div class="summary-header context">📌 Resumo da análise</div><div class="summary-content summary-resumo">`;
    html += `<p><strong>${items.length} ${linkLabel}(s)</strong> vinculada(s). Natureza predominante: <strong>${natureza}</strong>. Coerência do conjunto: <strong>${coerenciaLabel}</strong>.</p>`;
    if (catCounts.length) html += `<p style="margin-top:4px; font-size:11px; color:var(--text-secondary);">${catCounts.join(' · ')}</p>`;
    if (topTopics) html += `<p style="margin-top:6px; font-style:italic; color:var(--text-secondary);">Temas recorrentes: ${topTopics}.</p>`;
    html += `</div></div>`;

    if (leituraSugerida) {
        html += `<div class="summary-block"><div class="summary-header" style="background:rgba(34,197,94,0.12); color:var(--success);">📖 Leitura / Resumo sugerido</div><div class="summary-content summary-leitura">`;
        html += `<p>${(leituraSugerida||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`;
        html += `</div></div>`;
    }

    if (pontosAtencao.length > 0) {
        html += `<div class="summary-block"><div class="summary-header" style="background:rgba(245,158,11,0.15); color:var(--warning);">⚠️ Pontos de atenção</div><div class="summary-content">`;
        pontosAtencao.forEach(p => { html += `<div class="summary-item">${p.text}</div>`; });
        html += `</div></div>`;
    }

    if (divergentItem) {
        html += `<div class="summary-divergent"><strong style="display:block; margin-bottom:4px;">⚠️ SA com baixa afinidade</strong>A SA <u>${saLinkHtml(divergentItem)}</u> tem pouco em comum com as demais.<br><div style="margin-top:5px; font-style:italic; font-size:11px; opacity:0.8;">"${(divergentItem.desc||'').replace(/</g,'&lt;').replace(/>/g,'&gt;').substring(0, 120)}${(divergentItem.desc||'').length > 120 ? '...' : ''}"</div></div>`;
    }

    const allLinks = c.links || [];
    if (allLinks.length > 0) {
        html += `<div class="summary-block"><div class="summary-header normal">📋 ${linkLabelPlural}</div><div class="summary-content">`;
        allLinks.forEach((link, idx) => {
            const desc = (link.desc || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            html += `<div class="summary-sa-line"><span class="summary-sa-text">${saLinkHtml(link)}: ${desc}</span><button type="button" class="remove-sa-btn" data-index="${idx}" title="Excluir">X</button></div>`;
        });
        html += `</div></div>`;
    }

    summaryArea.innerHTML = html; 
    var statsEl = getEl('stats-count'); if (statsEl) statsEl.innerText = allLinks.length;
}

var BACKUP_DB_NAME = 'DailyPlanBackup';
var BACKUP_DB_STORE = 'handles';
var VERSION_FILE_NAME = 'DailyPlanVersao.txt';
var BACKUP_USER_KEY = 'dailyplan_backup_user';

function getBackupUserName() {
    try { return (localStorage.getItem(BACKUP_USER_KEY) || '').trim(); } catch (e) { return ''; }
}
function setBackupUserName(val) {
    try { localStorage.setItem(BACKUP_USER_KEY, (val || '').trim()); } catch (e) {}
}

var INSTRUCOES_ATUALIZAR_TEXTO = '1. DEIXAR A PASTA SEMPRE DEFINIDA PARA A EXTENSÃO\n\n• Abra o painel da extensão DailyPlan (ícone na barra do navegador).\n• No rodapé da barra lateral, clique em "Pasta backup".\n• Escolha a pasta do OneDrive que o administrador indicou (a mesma pasta onde ficam os backups e a versão da extensão).\n• Aceite a permissão quando o navegador pedir.\n• A partir daí, a extensão usará essa pasta para backup automático e para verificar se há nova versão.\n\n2. COMO ATUALIZAR A EXTENSÃO QUANDO APARECER O AVISO\n\n• Quando aparecer o aviso "Nova versão disponível!" no topo do painel:\n• Peça ao administrador o pacote atualizado da extensão (pasta ou arquivo .zip).\n• No Chrome, abra chrome://extensions\n• Ative "Modo desenvolvedor" (canto superior direito).\n• Se a extensão DailyPlan já estiver instalada: clique em "Atualizar" no card da extensão OU remova a extensão e em seguida arraste a nova pasta (ou descompacte o .zip e arraste a pasta) para a página chrome://extensions.\n• Se for a primeira instalação: arraste a pasta da extensão para a página chrome://extensions.\n• Feche e reabra o painel da extensão para usar a nova versão.';

function openBackupDB() {
    return new Promise(function(resolve, reject) {
        var req = indexedDB.open(BACKUP_DB_NAME, 1);
        req.onerror = function() { reject(req.error); };
        req.onsuccess = function() { resolve(req.result); };
        req.onupgradeneeded = function(e) { e.target.result.createObjectStore(BACKUP_DB_STORE); };
    });
}

function getBackupDirHandle() {
    return openBackupDB().then(function(db) {
        return new Promise(function(resolve, reject) {
            var tx = db.transaction(BACKUP_DB_STORE, 'readonly');
            var req = tx.objectStore(BACKUP_DB_STORE).get('backupDir');
            req.onsuccess = function() { resolve(req.result || null); };
            req.onerror = function() { reject(req.error); };
        });
    });
}

function setBackupDirHandle(handle) {
    return openBackupDB().then(function(db) {
        return new Promise(function(resolve, reject) {
            var tx = db.transaction(BACKUP_DB_STORE, 'readwrite');
            var req = tx.objectStore(BACKUP_DB_STORE).put(handle, 'backupDir');
            req.onsuccess = function() { resolve(); };
            req.onerror = function() { reject(req.error); };
        });
    });
}

function updateBackupFolderLabel(name) {
    var el = getEl('backup-folder-label');
    if (el) el.textContent = name ? 'Pasta: ' + name : '';
}

function parseVersion(str) {
    if (!str || typeof str !== 'string') return [0, 0, 0];
    var parts = str.trim().split('.').map(function(p) { var n = parseInt(p, 10); return isNaN(n) ? 0 : n; });
    while (parts.length < 3) parts.push(0);
    return parts.slice(0, 3);
}

function compareVersions(a, b) {
    var pa = parseVersion(a), pb = parseVersion(b);
    for (var i = 0; i < 3; i++) {
        if (pa[i] > pb[i]) return 1;
        if (pa[i] < pb[i]) return -1;
    }
    return 0;
}

function checkNewVersion() {
    return getBackupDirHandle().then(function(handle) {
        if (!handle) return { hasNew: false };
        var checkPerm = (handle.queryPermission && handle.queryPermission({ mode: 'read' })) || Promise.resolve('granted');
        return checkPerm.then(function(perm) {
            if (perm !== 'granted' && handle.requestPermission) return handle.requestPermission({ mode: 'read' }).then(function(p) { return p === 'granted' ? readVersionFile(handle) : { hasNew: false }; });
            if (perm !== 'granted') return { hasNew: false };
            return readVersionFile(handle);
        }).catch(function() { return { hasNew: false }; });
    }).catch(function() { return { hasNew: false }; });

    function readVersionFile(handle) {
        return handle.getFileHandle(VERSION_FILE_NAME, { create: false }).then(function(fileHandle) {
            return fileHandle.getFile();
        }).then(function(file) {
            return new Promise(function(resolve, reject) {
                var r = new FileReader();
                r.onload = function() { resolve(String(r.result || '').trim().split('\n')[0] || ''); };
                r.onerror = function() { reject(r.error); };
                r.readAsText(file);
            });
        }).then(function(remoteVersion) {
            var current = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) ? (chrome.runtime.getManifest().version || APP_VERSION) : APP_VERSION;
            if (compareVersions(remoteVersion, current) > 0) return { hasNew: true, newVersion: remoteVersion };
            return { hasNew: false };
        }).catch(function() { return { hasNew: false }; });
    }
}

function setBackupFolder() {
    if (typeof showDirectoryPicker === 'undefined') {
        alert('Seu navegador não suporta "Escolher pasta". Use o Chrome e tente novamente.');
        return;
    }
    showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' }).then(function(handle) {
        return setBackupDirHandle(handle).then(function() {
            try { localStorage.setItem('backupFolderName', handle.name); } catch (e) {}
            updateBackupFolderLabel(handle.name);
            alert('Pasta de backup definida: "' + handle.name + '". A partir de agora, os backups serão gravados nela.');
        });
    }).catch(function(err) {
        if (err.name !== 'AbortError') alert('Não foi possível definir a pasta: ' + (err.message || err));
    });
}

function writeBackupToFolder() {
    if (typeof showDirectoryPicker === 'undefined') return Promise.resolve(false);
    return getBackupDirHandle().then(function(handle) {
        if (!handle) return false;
        var checkPerm = (handle.queryPermission && handle.queryPermission({ mode: 'readwrite' })) || Promise.resolve('granted');
        return checkPerm.then(function(perm) {
            if (perm === 'granted') return doWrite(handle);
            if (handle.requestPermission) return handle.requestPermission({ mode: 'readwrite' }).then(function(p) { if (p === 'granted') return doWrite(handle); return false; });
            return false;
        }).catch(function() { return false; });
    }).catch(function() { return false; });
    function doWrite(handle) {
        var user = getBackupUserName() || 'sem_usuario';
        var safeUser = (user + '').replace(/[^a-zA-Z0-9_-]/g, '_');
        var name = 'backup_' + safeUser + '.json';
        var payload = { backupUser: user, exportedAt: new Date().toISOString(), cases: cases, groups: groups };
        return handle.getFileHandle(name, { create: true }).then(function(fileHandle) {
            return fileHandle.createWritable().then(function(writable) {
                writable.write(JSON.stringify(payload));
                return writable.close().then(function() { return true; });
            });
        }).catch(function() { return false; });
    }
}

function exportData() {
    var user = getBackupUserName() || 'sem_usuario';
    var payload = { backupUser: user, exportedAt: new Date().toISOString(), cases: cases, groups: groups };
    var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload));
    var dl = document.createElement('a');
    dl.setAttribute("href", dataStr);
    dl.setAttribute("download", "backup_total.json");
    document.body.appendChild(dl);
    dl.click();
    dl.remove();
}
function saveBackupToOneDrive() {
    var user = getBackupUserName() || 'sem_usuario';
    var payload = { backupUser: user, exportedAt: new Date().toISOString(), cases: cases, groups: groups };
    var data = JSON.stringify(payload);
    if (typeof showSaveFilePicker === 'undefined') { exportData(); alert('Seu navegador não suporta "escolher pasta". O backup foi baixado; salve-o manualmente na pasta do OneDrive.'); return; }
    showSaveFilePicker({ suggestedName: 'backup_total.json', types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] }).then(function(handle) {
        return handle.createWritable().then(function(writable) {
            writable.write(data);
            return writable.close();
        });
    }).then(function() { alert('Backup salvo! Se escolheu uma pasta do OneDrive, o arquivo será sincronizado para a nuvem.'); }).catch(function(err) {
        if (err.name !== 'AbortError') { exportData(); alert('Não foi possível salvar na pasta. O backup foi baixado. Salve-o manualmente na pasta do OneDrive.'); }
    });
}
function importData(input) {
    var file = input && input.files && input.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        var data;
        try { data = JSON.parse(e.target.result); } catch (err) { alert('Arquivo JSON inválido.'); input.value = ''; return; }
        if (Array.isArray(data)) cases = data;
        else if (data && Array.isArray(data.cases)) cases = data.cases;
        else cases = [];
        cases.forEach(function(c) { if (!c.workType) c.workType = 'PSAI'; });
        if (data && Array.isArray(data.groups)) groups = data.groups;
        else groups = [];
        storageSet({ 'myCasesV14': JSON.stringify(cases), 'myGroupsV1': JSON.stringify(groups) }, function() {
            location.reload();
        });
        input.value = '';
    };
    reader.onerror = function() { alert('Erro ao ler o arquivo.'); input.value = ''; };
    reader.readAsText(file);
}

function saveSelection(activeEl) { var el = activeEl || document.activeElement; if (el && el.classList && el.classList.contains('rich-input')) savedFocusElement = el; var sel = window.getSelection(); if (sel.getRangeAt && sel.rangeCount) { try { savedRange = sel.getRangeAt(0).cloneRange(); } catch (err) { savedRange = null; } } }
function restoreSelection() { if (savedFocusElement && savedFocusElement.focus) savedFocusElement.focus(); if (savedRange) { var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(savedRange); } }
function formatDoc(cmd, value = null) { document.execCommand('styleWithCSS', false, true); document.execCommand(cmd, false, value); saveSelection(); }
function buildColorPalette(container, command) { var colors = ['#000000', '#FFFFFF', '#EF4444', '#10B981', '#3B82F6', '#F59E0B', '#8B5CF6']; container.innerHTML = ''; colors.forEach(function(color) { var div = document.createElement('div'); div.className = 'color-swatch'; div.style.backgroundColor = color; div.addEventListener('mousedown', function(e) { e.preventDefault(); e.stopPropagation(); restoreSelection(); formatDoc(command, color); container.style.display = 'none'; }); container.appendChild(div); }); container.style.display = 'grid'; }
function toggleTheme(theme) {
    var isDark = theme === 'dark' || (theme !== 'light' && document.body.classList.contains('dark-mode'));
    document.body.classList.toggle('dark-mode', isDark);
    var deadlineEl = getEl('input-deadline');
    if (deadlineEl) deadlineEl.style.colorScheme = isDark ? 'dark' : 'light';
    localStorage.setItem('psaiTheme', isDark ? 'dark' : 'light');
}
function openSettingsModal() {
    var devArea = getEl('settings-developer-area');
    var pwdArea = getEl('settings-password-area');
    if (devArea) devArea.style.display = 'none';
    if (pwdArea) pwdArea.style.display = 'none';
    var backupUserEl = getEl('settings-backup-user');
    if (backupUserEl) backupUserEl.value = getBackupUserName();
    var theme = localStorage.getItem('psaiTheme') || 'dark';
    var lightBtn = getEl('settings-theme-light');
    var darkBtn = getEl('settings-theme-dark');
    if (lightBtn) { lightBtn.classList.toggle('btn-primary', theme === 'light'); lightBtn.classList.toggle('btn-secondary', theme !== 'light'); }
    if (darkBtn) { darkBtn.classList.toggle('btn-primary', theme === 'dark'); darkBtn.classList.toggle('btn-secondary', theme !== 'dark'); }
    openSettingsModalReminder();
    toggleModal('modal-settings', true);
}
function doChangePassword() { return Promise.resolve(false); }
function openInTab() { if (typeof chrome !== 'undefined' && chrome.tabs) chrome.tabs.create({ url: 'painel.html' }); else window.open('index.html', '_blank'); }
/** Extrai apenas o código da PSAI (ex: 117543) de um link ou do campo. */
function getPsaiCode(val) {
    if (!val || typeof val !== 'string') return '';
    var m = val.match(/psai=(\d+)/i);
    if (m) return m[1];
    return val.replace(/\D/g, '').trim() || '';
}
function openPsaiLink() {
    var code = getPsaiCode(getVal('input-psai-link'));
    if (code) openUrlInNewTab('https://sgd.dominiosistemas.com.br/sgsa/faces/psai.html?psai=' + code);
    else alert('Informe o código da PSAI (ex: 117543).');
}

function renderDashboard() {
    var monthEl = getEl('dashboard-month');
    var statsEl = getEl('dashboard-stats');
    var chartsEl = getEl('dashboard-charts');
    var listEl = getEl('dashboard-list');
    if (!monthEl || !statsEl || !listEl) return;
    var monthVal = monthEl.value || (function() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); })();
    if (!monthEl.value) monthEl.value = monthVal;
    var parts = monthVal.split('-');
    var year = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10);
    var start = new Date(year, month - 1, 1).getTime();
    var end = new Date(year, month, 0, 23, 59, 59, 999).getTime();

    function dateInPeriod(isoOrYmd) {
        if (!isoOrYmd || typeof isoOrYmd !== 'string') return false;
        var d = new Date(isoOrYmd);
        if (isNaN(d.getTime())) return false;
        var t = d.getTime();
        return t >= start && t <= end;
    }
    function caseRefTime(c) {
        if (c.saiData && typeof c.saiData === 'string' && c.saiData.trim()) {
            var d = new Date(c.saiData);
            if (!isNaN(d.getTime())) return d.getTime();
        }
        return c.lastUpdated || c.id;
    }
    var inPeriod = cases.filter(function(c) {
        if (c.saiData && typeof c.saiData === 'string' && c.saiData.trim()) return dateInPeriod(c.saiData);
        return (c.lastUpdated || c.id) >= start && (c.lastUpdated || c.id) <= end;
    });
    var concluded = inPeriod.filter(function(c) { return c.status && (c.status.indexOf('Concluído') !== -1 || c.status.indexOf('Reprovada') !== -1); });
    var withScore = inPeriod.filter(function(c) { return c.saiScore !== undefined && c.saiScore !== '' && !isNaN(parseFloat(c.saiScore)); });
    var avgScore = withScore.length ? (withScore.reduce(function(s, c) { return s + parseFloat(c.saiScore); }, 0) / withScore.length).toFixed(1) : '-';
    var totalScore = withScore.length ? withScore.reduce(function(s, c) { return s + parseFloat(c.saiScore); }, 0) : 0;
    statsEl.innerHTML = '<div class="dashboard-stat"><div class="val">' + inPeriod.length + '</div><div class="lbl">No período</div></div><div class="dashboard-stat"><div class="val">' + concluded.length + '</div><div class="lbl">Concluídos</div></div><div class="dashboard-stat"><div class="val">' + avgScore + '</div><div class="lbl">Pont. média</div></div><div class="dashboard-stat"><div class="val">' + totalScore + '</div><div class="lbl">Pont. total</div></div>';
    var byType = { PSAI: 0, SS: 0, SAI: 0, NE: 0 };
    inPeriod.forEach(function(c) { var w = c.workType || 'PSAI'; if (byType[w] !== undefined) byType[w]++; else byType.PSAI++; });
    var total = byType.PSAI + byType.SS + byType.SAI + byType.NE || 1;
    var pctP = (byType.PSAI / total * 100).toFixed(1); var pctS = (byType.SS / total * 100).toFixed(1); var pctA = (byType.SAI / total * 100).toFixed(1); var pctN = (byType.NE / total * 100).toFixed(1);
    var conic = total ? 'conic-gradient(var(--tr-orange) 0% ' + pctP + '%, #3b82f6 ' + pctP + '% ' + (parseFloat(pctP) + parseFloat(pctS)) + '%, #10b981 ' + (parseFloat(pctP) + parseFloat(pctS)) + '% ' + (parseFloat(pctP) + parseFloat(pctS) + parseFloat(pctA)) + '%, #8b5cf6 ' + (parseFloat(pctP) + parseFloat(pctS) + parseFloat(pctA)) + '% 100%)' : 'var(--border-color)';
    var last6 = [];
    var now = new Date();
    for (var i = 5; i >= 0; i--) {
        var m = new Date(now.getFullYear(), now.getMonth() - i, 1);
        var s = m.getTime();
        var e = new Date(m.getFullYear(), m.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
        var psaiCount = cases.filter(function(c) {
            if ((c.workType || '') !== 'PSAI') return false;
            if (c.psaiData && typeof c.psaiData === 'string' && c.psaiData.trim()) {
                var d = new Date(c.psaiData);
                if (!isNaN(d.getTime())) { var t = d.getTime(); return t >= s && t <= e; }
            }
            var t = c.lastUpdated || c.id;
            return t >= s && t <= e;
        }).length;
        var saiCount = cases.filter(function(c) {
            if (!c.saiData || typeof c.saiData !== 'string' || !c.saiData.trim()) return false;
            var d = new Date(c.saiData);
            if (isNaN(d.getTime())) return false;
            var t = d.getTime();
            return t >= s && t <= e;
        }).length;
        last6.push({
            label: m.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
            psai: psaiCount,
            sai: saiCount
        });
    }
    var maxVal = Math.max(1, Math.max.apply(null, last6.map(function(x) { return Math.max(x.psai, x.sai); })));
    var barsHtml = last6.map(function(x) {
        var psaiH = (x.psai / maxVal * 100).toFixed(0);
        var saiH = (x.sai / maxVal * 100).toFixed(0);
        return '<div class="chart-bar-wrap"><div class="chart-bars-group"><div class="chart-bar chart-bar-psai" style="height:' + psaiH + '%" title="PSAI: ' + x.psai + '"></div><div class="chart-bar chart-bar-sai" style="height:' + saiH + '%" title="SAI: ' + x.sai + '"></div></div><div class="chart-bar-lbl">' + escapeHtml(x.label) + '</div></div>';
    }).join('');
    var barCardHtml = '<div class="dashboard-chart-card chart-line-card"><h4>Últimos 6 meses</h4><div class="chart-bars chart-bars-dual">' + barsHtml + '</div><div class="chart-line-legend"><span><span class="dot" style="background:var(--tr-orange)"></span>PSAI analisadas</span><span><span class="dot" style="background:#10b981"></span>SAIs geradas</span></div></div>';
    if (chartsEl) chartsEl.innerHTML = '<div class="dashboard-chart-card"><h4>Volume por tipo</h4><div class="chart-donut" style="background:' + conic + '"></div><div class="chart-legend"><span><span class="dot" style="background:var(--tr-orange)"></span>PSAI ' + byType.PSAI + '</span><span><span class="dot" style="background:#3b82f6"></span>SS ' + byType.SS + '</span><span><span class="dot" style="background:#10b981"></span>SAI ' + byType.SAI + '</span><span><span class="dot" style="background:#8b5cf6"></span>NE ' + byType.NE + '</span></div></div>' + barCardHtml;
    inPeriod.sort(function(a, b) { return caseRefTime(b) - caseRefTime(a); });
    listEl.innerHTML = '';
    function formatSaiDateForDisplay(isoOrYmd) {
        if (!isoOrYmd || typeof isoOrYmd !== 'string') return '';
        var d = new Date(isoOrYmd);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    inPeriod.forEach(function(c) {
        var item = document.createElement('div');
        item.className = 'dashboard-item';
        var meta = (statusForCase(c) || '').substring(0, 25);
        var refDate = c.saiData && typeof c.saiData === 'string' && c.saiData.trim() ? new Date(c.saiData) : (c.lastUpdated ? new Date(c.lastUpdated) : null);
        if (refDate && !isNaN(refDate.getTime())) meta = refDate.toLocaleDateString('pt-BR') + ' – ' + meta;
        var level = (c.saiChangeLevel || '-');
        var score = (c.saiScore !== undefined && c.saiScore !== '' ? c.saiScore : '-');
        var scoreDate = formatSaiDateForDisplay(c.saiData);
        var scoreHtml = '<span class="d-score">' + (typeof score === 'number' ? score : escapeHtml(String(score))) + '</span>';
        if (scoreDate) scoreHtml += ' <span class="d-score-date">(' + escapeHtml(scoreDate) + ')</span>';
        var wt = (c.workType || 'PSAI');
        item.innerHTML = '<span class="d-title">' + (c.title || 'Sem título').replace(/</g, '&lt;') + '</span><span class="d-meta">' + meta.replace(/</g, '&lt;') + '</span><span class="d-level">' + wt + ' · ' + level + '</span>' + scoreHtml;
        item.addEventListener('click', function() { loadCase(c.id); toggleModal('modal-dashboard', false); var g = getEl('btn-tab-general'); if (g) g.click(); });
        listEl.appendChild(item);
    });
    if (inPeriod.length === 0) listEl.innerHTML = '<p style="color:var(--text-secondary); padding:12px;">Nenhuma análise no período (por data SAI ou última atualização).</p>';
}

// --- LEMBRETE: copiar informações para anotações PSAI, SS, SAI ---
var REMINDER_STORAGE_KEY = 'psaiReminderConfig';
var REMINDER_LAST_KEY = 'psaiReminderLast';
var reminderCheckTimer = null;

function getReminderConfig() {
    try {
        var raw = localStorage.getItem(REMINDER_STORAGE_KEY);
        if (!raw) return { enabled: false, times: [] };
        var o = JSON.parse(raw);
        return { enabled: !!o.enabled, times: Array.isArray(o.times) ? o.times : [] };
    } catch (e) { return { enabled: false, times: [] }; }
}

function setReminderConfig(config) {
    try {
        localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify({ enabled: !!config.enabled, times: config.times || [] })); 
    } catch (e) {}
}

function parseReminderTimes(str) {
    if (!str || typeof str !== 'string') return [];
    return str.split(/[\s,;]+/).map(function(s) {
        s = s.trim().replace(/\s/g, '');
        if (/^\d{1,2}:\d{2}$/.test(s)) return s;
        if (/^\d{1,2}$/.test(s)) return s.length === 1 ? '0' + s + ':00' : s + ':00';
        return null;
    }).filter(Boolean);
}

function getReminderLastNotified() {
    try {
        var raw = localStorage.getItem(REMINDER_LAST_KEY);
        if (!raw) return {};
        return JSON.parse(raw);
    } catch (e) { return {}; }
}

function setReminderLastNotified(dateStr, timeStr) {
    var o = getReminderLastNotified();
    if (!o[dateStr]) o[dateStr] = [];
    if (o[dateStr].indexOf(timeStr) === -1) o[dateStr].push(timeStr);
    try { localStorage.setItem(REMINDER_LAST_KEY, JSON.stringify(o)); } catch (e) {}
}

function showReminderNotification() {
    var title = 'DailyPlan – Lembrete';
    var body = 'Copie as informações e coloque nas anotações da PSAI, SS e SAI.';
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification(title, { body: body }); return; } catch (e) {}
    }
    if (typeof toast !== 'undefined' && toast.success) { toast.success(body); return; }
    alert(title + '\n\n' + body);
}

function runReminderCheck() {
    var config = getReminderConfig();
    if (!config.enabled || !config.times.length) return;
    var now = new Date();
    var h = now.getHours();
    var m = now.getMinutes();
    var currentTime = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    var dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    var last = getReminderLastNotified();
    if (last[dateStr] && last[dateStr].indexOf(currentTime) !== -1) return;
    if (config.times.indexOf(currentTime) === -1) return;
    setReminderLastNotified(dateStr, currentTime);
    showReminderNotification();
}

function startReminderInterval() {
    if (reminderCheckTimer) clearInterval(reminderCheckTimer);
    reminderCheckTimer = null;
    var config = getReminderConfig();
    if (!config.enabled || !config.times.length) return;
    reminderCheckTimer = setInterval(runReminderCheck, 60000);
    runReminderCheck();
}

function openSettingsModalReminder() {
    var config = getReminderConfig();
    var cb = getEl('reminder-enabled');
    var input = getEl('reminder-times');
    if (cb) cb.checked = config.enabled;
    if (input) input.value = (config.times || []).join(', ');
}

function saveReminderSettings() {
    var cb = getEl('reminder-enabled');
    var input = getEl('reminder-times');
    var enabled = cb ? cb.checked : false;
    var times = input ? parseReminderTimes(input.value) : [];
    setReminderConfig({ enabled: enabled, times: times });
    if (enabled && times.length && typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    startReminderInterval();
    if (typeof toast !== 'undefined' && toast.success) toast.success('Lembrete salvo.');
    else alert('Lembrete salvo.');
}

// INICIALIZADOR
document.addEventListener('DOMContentLoaded', function() {
    function runApp() {
        init();
        showUserBar();
        startReminderInterval();
        if (!currentId) {
            var ca = getEl('content-area');
            var es = getEl('empty-state');
            if (ca) ca.classList.remove('content-area-visible');
            if (es) es.classList.remove('hidden');
            closeGroupView();
        }
        getBackupDirHandle().then(function(h) {
        if (h) { try { localStorage.setItem('backupFolderName', h.name); } catch (e) {} updateBackupFolderLabel(h.name); }
        else { try { localStorage.removeItem('backupFolderName'); } catch (e) {} updateBackupFolderLabel(''); }
    }).catch(function() { updateBackupFolderLabel(''); });

        checkNewVersion().then(function(r) {
            var banner = getEl('new-version-banner');
            var numEl = getEl('new-version-number');
            if (!banner || !r.hasNew) return;
            try { if (sessionStorage.getItem('dailyplan-dismissed-version') === (r.newVersion || '')) return; } catch (e) {}
            if (numEl) numEl.textContent = '(v' + r.newVersion + ') ';
            banner.setAttribute('data-new-version', r.newVersion || '');
            banner.style.display = 'block';
        });
    
    // BOTÃO SAI
    var btnOpenSai = getEl('btn-open-sai');
    if (btnOpenSai) btnOpenSai.addEventListener('click', function() {
        var val = getVal('input-sai-generated');
        if(val) openUrlInNewTab(`https://sgsai.dominiosistemas.com.br/sgsai/faces/sai.html?sai=${val}`); else alert("Informe o código SAI!");
    });
    // BOTÃO SS (abrir SS no sistema)
    var btnOpenSs = getEl('btn-open-ss');
    if (btnOpenSs) btnOpenSs.addEventListener('click', function() {
        var val = getVal('input-ss-numero');
        if (val) openUrlInNewTab(`https://sgd.dominiosistemas.com.br/sgsa/faces/ss.html?ss=${encodeURIComponent(val)}`); else alert("Informe o código SS!");
    });

    var btnAddNote = getEl('btn-add-note');
    if (btnAddNote) btnAddNote.addEventListener('click', addNote);
    var inputNote = getEl('new-note-input');
    if(inputNote) { inputNote.addEventListener('keypress', function(e) { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote(); } }); }

    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabBtns.forEach(btn => btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        btn.classList.add('active'); var tabEl = getEl(btn.getAttribute('data-tab')); if (tabEl) tabEl.classList.add('active');
    }));
    var monthInput = getEl('dashboard-month');
    if (monthInput) monthInput.addEventListener('change', renderDashboard);
    var dashboardRefresh = getEl('dashboard-refresh');
    if (dashboardRefresh) dashboardRefresh.addEventListener('click', renderDashboard);

    document.querySelectorAll('.filter-chip').forEach(function(btn) {
        btn.addEventListener('click', function() {
            workTypeFilter = btn.getAttribute('data-filter') || 'all';
            document.querySelectorAll('.filter-chip').forEach(function(b) { b.classList.remove('active'); if (b.getAttribute('data-filter') === workTypeFilter) b.classList.add('active'); });
            renderSidebar();
        });
    });
    document.querySelectorAll('.psai-dominio-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var d = (btn.getAttribute('data-dominio') || '').trim();
            btn.classList.toggle('active');
            var localBtn = document.querySelector('.psai-dominio-btn[data-dominio="Local"]');
            var webBtn = document.querySelector('.psai-dominio-btn[data-dominio="Web"]');
            var hasLocal = localBtn && localBtn.classList.contains('active');
            var hasWeb = webBtn && webBtn.classList.contains('active');
            var val = '';
            if (hasLocal && hasWeb) val = 'Local e Web';
            else if (hasLocal) val = 'Local';
            else if (hasWeb) val = 'Web';
            setVal('input-psai-dominio', val);
        });
    });
    document.querySelectorAll('.work-type-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            workTypeFilter = btn.getAttribute('data-type') || 'all';
            document.querySelectorAll('.filter-chip').forEach(function(b) { b.classList.remove('active'); if (b.getAttribute('data-filter') === workTypeFilter) b.classList.add('active'); });
            renderSidebar();
        });
    });
    (function setFilterActive() { document.querySelectorAll('.filter-chip').forEach(function(b) { b.classList.toggle('active', b.getAttribute('data-filter') === workTypeFilter); }); })();

    const actions = {
        'close-notes': () => toggleModal('modal-notes', false),
        'btn-calendar': openCalendar, 'close-calendar': () => toggleModal('modal-calendar', false),
        'btn-dashboard': function() { var m = getEl('dashboard-month'); if (m && !m.value) { var d = new Date(); m.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); } toggleModal('modal-dashboard', true); renderDashboard(); }, 'close-dashboard': function() { toggleModal('modal-dashboard', false); },
        'btn-search': openSearchModal,
        'close-search': () => toggleModal('modal-search', false),
        'btn-notes': () => toggleModal('modal-notes', true),
        'theme-toggle': openSettingsModal, 'add-btn': addNewCase,
        'close-settings': () => toggleModal('modal-settings', false),
        'btn-save-reminder': saveReminderSettings,
        'settings-theme-light': function() { toggleTheme('light'); var l = getEl('settings-theme-light'); var d = getEl('settings-theme-dark'); if (l) { l.classList.add('btn-primary'); l.classList.remove('btn-secondary'); } if (d) { d.classList.remove('btn-primary'); d.classList.add('btn-secondary'); } },
        'settings-theme-dark': function() { toggleTheme('dark'); var l = getEl('settings-theme-light'); var d = getEl('settings-theme-dark'); if (d) { d.classList.add('btn-primary'); d.classList.remove('btn-secondary'); } if (l) { l.classList.remove('btn-primary'); l.classList.add('btn-secondary'); } },
        'btn-users-from-settings': function() { },
        'btn-change-password': function() { },
        'close-change-password': function() { },
        'close-instrucoes-atualizar': () => toggleModal('modal-instrucoes-atualizar', false),
        'btn-group-view-back': closeGroupView,
        'btn-group-edit-name': startEditGroupName,
        'btn-group-name-save': saveGroupName,
        'btn-group-name-cancel': cancelEditGroupName,
        'btn-group-add-cases': openAddToGroupModal,
        'btn-group-delete': deleteGroup,
        'btn-new-group': openNewGroupModal,
        'close-new-group': () => toggleModal('modal-new-group', false),
        'btn-create-group': createGroupFromModal,
        'close-add-to-group': () => toggleModal('modal-add-to-group', false),
        'btn-add-to-group': addCasesToGroupFromModal,
        'btn-close-new-version': function() {
            var banner = getEl('new-version-banner');
            var ver = banner ? banner.getAttribute('data-new-version') || '' : '';
            try { if (ver) sessionStorage.setItem('dailyplan-dismissed-version', ver); } catch (e) {}
            if (banner) banner.style.display = 'none';
        },
        'btn-ver-instrucoes': function() {
            var body = getEl('instrucoes-atualizar-body');
            if (body) body.textContent = (typeof INSTRUCOES_ATUALIZAR_TEXTO !== 'undefined') ? INSTRUCOES_ATUALIZAR_TEXTO : 'Consulte o documento de instruções enviado pelo administrador.';
            toggleModal('modal-instrucoes-atualizar', true);
        },
        'btn-backup': function() {
            writeBackupToFolder().then(function(ok) {
                if (ok) alert('Backup gravado na pasta definida.');
                else {
                    getBackupDirHandle().then(function(handle) {
                        if (!handle) alert('Pasta não definida. Clique em "Pasta backup" e escolha a pasta (ex.: pasta do OneDrive no seu PC). O backup foi baixado.');
                        else alert('Permissão negada ou erro ao gravar. Clique em "Pasta backup", escolha a pasta novamente e conceda o acesso quando o navegador pedir. O backup foi baixado.');
                        exportData();
                    }).catch(function() { exportData(); alert('Pasta não definida. Clique em "Pasta backup" e escolha a pasta. O backup foi baixado.'); });
                }
            });
        }, 'btn-set-backup-folder': setBackupFolder, 'btn-restore': function() { var fi = getEl('file-input'); if (fi) fi.click(); },
        'btn-go': openPsaiLink, 
'btn-add-sa': addSaFromForm,
        'btn-add-manager': () => addManagerReviewRow(),
        'btn-save-gen': saveCurrentCase, 'btn-save-tech': saveCurrentCase, 'btn-delete-gen': deleteCase, 'btn-delete-tech': deleteCase,
        'btn-copy-tech': copyTechnicalData, 'btn-copy-contexto': copyContextoResumoContent, 'btn-export-single-gen': exportSingleCase, 'btn-export-single-tech': exportSingleCase,
        'btn-ler-ss': function() { setVal('ss-html-paste', ''); toggleModal('modal-ler-ss', true); },
        'close-ler-ss': () => toggleModal('modal-ler-ss', false),
        'btn-ss-upload-html': function() { var f = getEl('file-ss-html'); if (f) f.click(); },
        'btn-ss-parse': function() {
            var html = getVal('ss-html-paste') || '';
            if (!html.trim()) { alert('Cole o HTML da SS ou envie um arquivo.'); return; }
            var data = parseSSHtml(html);
            applyParsedSS(data);
            toggleModal('modal-ler-ss', false);
        },
        'btn-ler-ss-aba': function() {
            if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.runtime) {
                setVal('ss-html-paste', ''); toggleModal('modal-ler-ss', true);
                return;
            }
            var ssNumero = (getVal('input-ss-numero') || '').trim();
            if (!ssNumero) {
                alert('Informe o código da SS no painel (campo Cód. SS) antes de usar "Ler da Aba Aberta".');
                return;
            }
            chrome.tabs.query({ url: '*://sgd.dominiosistemas.com.br/sgsa/faces/ss.html*' }, function(tabs) {
                if (!tabs || tabs.length === 0) {
                    alert('Nenhuma aba com a página da SS (sistema legado) encontrada.\nAbra a SS no navegador (sgd.dominiosistemas.com.br) e tente novamente.');
                    return;
                }
                var reSs = new RegExp('[?&]ss=([0-9]+)');
                var tab = null;
                for (var i = 0; i < tabs.length; i++) {
                    var m = (tabs[i].url || '').match(reSs);
                    if (m && m[1] === ssNumero) { tab = tabs[i]; break; }
                }
                if (!tab) {
                    alert('Nenhuma aba aberta com a SS ' + ssNumero + '.\nAbra a página da SS ' + ssNumero + ' no navegador (sgd.dominiosistemas.com.br/sgsa/faces/ss.html?ss=' + ssNumero + ') e tente novamente.');
                    return;
                }
                chrome.tabs.sendMessage(tab.id, { action: 'SCRAPE_SS' }, function(response) {
                    if (chrome.runtime.lastError) {
                        alert('Não foi possível ler a aba. Recarregue a página da SS (F5) e tente de novo.');
                        return;
                    }
                    if (response && response.html) {
                        var data = parseSSHtml(response.html);
                        applyParsedSS(data);
                        var badge = getEl('ss-tramites-badge');
                        if (badge) badge.textContent = (data.tramitesCount || 0) + ((data.tramitesCount || 0) === 1 ? ' Trâmite' : ' Trâmites');
                    } else if (response && response.error) {
                        alert('Erro ao extrair dados: ' + response.error);
                    } else {
                        alert('Resposta inválida da aba. Recarregue a página da SS e tente novamente.');
                    }
                });
            });
        }
    };
    for (var actionId in actions) { if (!actions.hasOwnProperty(actionId)) continue; var el = getEl(actionId); if (el) el.addEventListener('click', actions[actionId]); }
    var groupNameEditInput = getEl('group-view-name-edit');
    if (groupNameEditInput) groupNameEditInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); saveGroupName(); }
        if (e.key === 'Escape') { e.preventDefault(); cancelEditGroupName(); }
    });
    document.body.addEventListener('click', function(e) {
        var t = e.target;
        if (t && t.closest && t.closest('button') && !t.closest('.card-toggle-btn')) return;
        var header = t && t.closest ? t.closest('.card-header-toggle') : null;
        if (header) {
            var card = header.closest('.card-collapsible');
            if (card) card.classList.toggle('card-minimized');
        }
    });

    var searchQueryEl = document.getElementById('search-query');
    if (searchQueryEl) searchQueryEl.addEventListener('input', function() { renderSearchResults(this.value); });
    if (searchQueryEl) searchQueryEl.addEventListener('keydown', function(e) { if (e.key === 'Escape') toggleModal('modal-search', false); });
    ['search-filter-date', 'search-filter-status', 'search-filter-priority'].forEach(function(id) {
        var el = getEl(id);
        if (el) el.addEventListener('change', function() { renderSearchResults(); });
        if (el && id === 'search-filter-date') el.addEventListener('input', function() { renderSearchResults(); });
    });

    var fileSsHtml = getEl('file-ss-html');
    if (fileSsHtml) fileSsHtml.addEventListener('change', function() {
        var f = this.files && this.files[0];
        if (!f) return;
        var r = new FileReader();
        r.onload = function() { setVal('ss-html-paste', r.result || ''); };
        r.readAsText(f, 'UTF-8');
        this.value = '';
    });

    var fileInput = getEl('file-input'); if (fileInput) fileInput.addEventListener('change', function() { importData(this); });
    var backupUserInput = getEl('settings-backup-user');
    if (backupUserInput) backupUserInput.addEventListener('blur', function() { setBackupUserName(this.value); });
    var psaiLinkInput = getEl('input-psai-link');
    if (psaiLinkInput) psaiLinkInput.addEventListener('blur', function() {
        var code = getPsaiCode(this.value);
        if (code && this.value !== code) { this.value = code; if (currentId) triggerAutoSave(); }
    });
    document.body.addEventListener('input', (e) => { if(e.target.matches('input, textarea, .rich-input') && currentId && e.target.id !== 'new-note-input' && e.target.id !== 'new-sa-code' && e.target.id !== 'new-sa-url' && e.target.id !== 'new-sa-desc') triggerAutoSave(); });
    document.body.addEventListener('change', (e) => {
        if ((e.target.matches('select') || e.target.id === 'input-ss-banco-cliente') && currentId) {
            triggerAutoSave();
            if (e.target.id === 'input-work-type') switchMainPanel(e.target.value || 'PSAI');
            if (e.target.id === 'input-ss-proximo-passo') toggleSsSaNeCodigoVisibility();
            if (e.target.id === 'input-ss-banco-cliente') toggleBancoClienteConteudoVisibility();
            if (e.target.id === 'input-status') togglePsaiStatusExtras();
        }
    });

    document.querySelectorAll('.rich-input').forEach(function(input) {
        input.addEventListener('keyup', saveSelection); input.addEventListener('mouseup', saveSelection); input.addEventListener('focus', saveSelection); input.addEventListener('blur', function() { saveSelection(input); });
    });
    document.querySelectorAll('.btn-format').forEach(function(btn) { btn.addEventListener('mousedown', function(e) { e.preventDefault(); formatDoc(btn.getAttribute('data-cmd')); }); });
    document.querySelectorAll('.btn-toggle-palette').forEach(function(btn) {
        btn.addEventListener('mousedown', function(e) {
            e.preventDefault(); e.stopPropagation();
            saveSelection();
            document.querySelectorAll('.color-palette').forEach(function(p) { p.style.display = 'none'; });
            var palette = btn.nextElementSibling;
            if (!palette || !palette.classList.contains('color-palette')) return;
            if (palette.innerHTML === '') buildColorPalette(palette, palette.getAttribute('data-target'));
            palette.style.display = (palette.style.display === 'grid') ? 'none' : 'grid';
        });
    });
    document.addEventListener('click', (e) => { if (!e.target.classList.contains('color-swatch') && !e.target.closest('.btn-toggle-palette')) document.querySelectorAll('.color-palette').forEach(p => p.style.display = 'none'); });

    var summaryAreaEl = getEl('summary-area');
    if(summaryAreaEl) summaryAreaEl.addEventListener('click', (e) => {
        const a = e.target.closest('a.summary-sa-link'); if(a && a.href){ e.preventDefault(); openUrlInNewTab(a.href); return; }
        const removeBtn = e.target.closest('button.remove-sa-btn'); if(removeBtn && currentId){ const idx = parseInt(removeBtn.getAttribute('data-index'), 10); const c = cases.find(x => x.id === currentId); if(c && c.links && !isNaN(idx) && idx >= 0 && idx < c.links.length){ c.links.splice(idx, 1); saveData(true); analyzeData(currentId); } }
    });
    
    var researchWrapper = getEl('research-wrapper');
    if (researchWrapper) {
        researchWrapper.addEventListener('click', function(e) {
            if (e.target.classList.contains('remove-btn')) { e.target.closest('.link-row').remove(); triggerAutoSave(); }
            if (e.target.classList.contains('open-link-btn')) { var url = (e.target.closest('.link-row-top') || e.target.parentElement).querySelector('.link-url').value; openUrlInNewTab(url); }
            var addBtn = e.target.closest('.btn-add-research-topic');
            if (addBtn && addBtn.getAttribute('data-topic')) { addResearchRow('', '', true, addBtn.getAttribute('data-topic')); }
        });
    }

    var manContainer = getEl('manager-reviews-container');
    if(manContainer) manContainer.addEventListener('click', (e) => {
        if(e.target.classList.contains('remove-btn')){ e.target.closest('.manager-row').remove(); triggerAutoSave(); }
    });
    }

    var loginBtn = document.getElementById('btn-github-login');
    if (loginBtn) loginBtn.addEventListener('click', loginWithGitHub);
    var logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', logoutUser);
    var adminBtn = document.getElementById('btn-admin-panel');
    if (adminBtn) adminBtn.addEventListener('click', function() { loadAdminUsersList(); toggleModal('modal-admin', true); });
    var closeAdminBtn = document.getElementById('close-admin');
    if (closeAdminBtn) closeAdminBtn.addEventListener('click', function() { toggleModal('modal-admin', false); });

    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged(function(fbUser) {
            _onAuthReady(fbUser, function() { runApp(); });
        });
    } else {
        document.body.classList.remove('auth-required');
        runApp();
    }
});