const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || '{}');

if (!token || user.role !== 'admin') {
    window.location.href = '/index.html';
}

// 页面导航
const navItems = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.page');
const pageTitle = document.getElementById('pageTitle');

const pageTitles = {
    dashboard: '数据概览',
    users: '用户管理',
    documents: '文件管理',
    messages: '消息管理'
};

navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        showPage(page);
    });
});

function showPage(page) {
    navItems.forEach(n => n.classList.toggle('active', n.dataset.page === page));
    pages.forEach(p => p.classList.toggle('active', p.id === page + 'Page'));
    pageTitle.textContent = pageTitles[page];

    if (page === 'dashboard') loadStats();
    if (page === 'users') loadUsers();
    if (page === 'documents') loadDocuments();
    if (page === 'messages') loadMessages();
}

// 通用请求
async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': 'Bearer ' + token,
            ...(options.headers || {})
        }
    });
    return res;
}

// ===== Dashboard =====
async function loadStats() {
    try {
        const res = await apiFetch('/api/admin/stats');
        const data = await res.json();
        document.getElementById('statUsers').textContent = data.users;
        document.getElementById('statOnline').textContent = data.online;
        document.getElementById('statMessages').textContent = data.messages;
        document.getElementById('statDocuments').textContent = data.documents;
        document.getElementById('statFolders').textContent = data.folders;
    } catch (err) {
        console.error('加载统计数据失败', err);
    }
}

// ===== 用户管理 =====
let allUsers = [];
let currentEditUserId = null;
let currentPwdUserId = null;

async function loadUsers() {
    try {
        const res = await apiFetch('/api/admin/users');
        allUsers = await res.json();
        renderUsers(allUsers);
    } catch (err) {
        document.getElementById('usersTableBody').innerHTML = '<tr><td colspan="9" class="empty-state">加载失败</td></tr>';
    }
}

function renderUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state">暂无用户</td></tr>';
        return;
    }
    tbody.innerHTML = users.map(u => {
        const genderMap = { male: '♂ 男', female: '♀ 女', gay: '⚤ Gay', '': '-' };
        const date = u.createdAt ? new Date(u.createdAt).toLocaleDateString('zh-CN') : '-';
        return `
            <tr>
                <td>${u.id}</td>
                <td><img src="${u.avatar || '/uploads/avatars/default-avatar.png'}" class="table-avatar"></td>
                <td>${escapeHtml(u.username)}</td>
                <td>${escapeHtml(u.nickname || '-')}</td>
                <td>${genderMap[u.gender] || '-'}</td>
                <td><span class="tag ${u.role === 'admin' ? 'tag-admin' : 'tag-user'}">${u.role === 'admin' ? '管理员' : '用户'}</span></td>
                <td><span class="tag ${u.banned ? 'tag-banned' : 'tag-normal'}">${u.banned ? '已封禁' : '正常'}</span></td>
                <td>${date}</td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-small btn-primary" onclick="openEditUser(${u.id})">编辑</button>
                        <button class="btn btn-small ${u.banned ? 'btn-success' : 'btn-secondary'}" onclick="toggleBan(${u.id}, ${!u.banned})">${u.banned ? '解封' : '封禁'}</button>
                        <button class="btn btn-small btn-secondary" onclick="openChangePassword(${u.id}, '${escapeHtml(u.username)}')">改密</button>
                        <button class="btn btn-small btn-danger" onclick="deleteUser(${u.id})">删除</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

document.getElementById('userSearch').addEventListener('input', (e) => {
    const kw = e.target.value.trim().toLowerCase();
    if (!kw) { renderUsers(allUsers); return; }
    const filtered = allUsers.filter(u => (u.username || '').toLowerCase().includes(kw) || (u.nickname || '').toLowerCase().includes(kw));
    renderUsers(filtered);
});

function openEditUser(id) {
    const u = allUsers.find(x => x.id === id);
    if (!u) return;
    currentEditUserId = id;
    document.getElementById('editUserUsername').value = u.username;
    document.getElementById('editUserNickname').value = u.nickname || '';
    document.querySelectorAll('input[name="editUserGender"]').forEach(r => r.checked = r.value === (u.gender || ''));
    document.getElementById('editUserRole').value = u.role || 'user';
    document.getElementById('editUserModal').classList.add('show');
}

window.openEditUser = openEditUser;

async function saveEditUser() {
    const nickname = document.getElementById('editUserNickname').value.trim();
    const genderEl = document.querySelector('input[name="editUserGender"]:checked');
    const gender = genderEl ? genderEl.value : '';
    const role = document.getElementById('editUserRole').value;

    const body = {};
    if (nickname) body.nickname = nickname;
    body.gender = gender;
    body.role = role;

    const res = await apiFetch(`/api/admin/users/${currentEditUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.ok) {
        document.getElementById('editUserModal').classList.remove('show');
        loadUsers();
    } else {
        alert(data.message || '编辑失败');
    }
}

document.getElementById('saveUserBtn').addEventListener('click', saveEditUser);

async function toggleBan(id, banned) {
    if (!confirm(banned ? '确定封禁该用户？' : '确定解封该用户？')) return;
    const res = await apiFetch(`/api/admin/users/${id}/ban`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banned })
    });
    const data = await res.json();
    if (res.ok) loadUsers();
    else alert(data.message || '操作失败');
}

window.toggleBan = toggleBan;

async function deleteUser(id) {
    if (!confirm('确定删除该用户？此操作不可恢复！')) return;
    const res = await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) loadUsers();
    else alert(data.message || '删除失败');
}

window.deleteUser = deleteUser;

function openChangePassword(id, username) {
    currentPwdUserId = id;
    document.getElementById('pwdUserUsername').value = username;
    document.getElementById('adminNewPassword').value = '';
    document.getElementById('changePasswordModal').classList.add('show');
}

window.openChangePassword = openChangePassword;

async function savePassword() {
    const newPassword = document.getElementById('adminNewPassword').value;
    if (!newPassword || newPassword.length < 6) {
        alert('密码长度至少为6个字符');
        return;
    }
    const res = await apiFetch(`/api/admin/users/${currentPwdUserId}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword })
    });
    const data = await res.json();
    if (res.ok) {
        document.getElementById('changePasswordModal').classList.remove('show');
        alert('密码修改成功');
    } else {
        alert(data.message || '修改失败');
    }
}

document.getElementById('savePasswordBtn').addEventListener('click', savePassword);

// ===== 文件管理 =====
let allDocs = [];
let allFolders = [];

async function loadDocuments() {
    try {
        const [docRes, folderRes] = await Promise.all([
            apiFetch('/api/admin/documents'),
            apiFetch('/api/admin/folders')
        ]);
        allDocs = await docRes.json();
        allFolders = await folderRes.json();
        renderFolders();
        renderDocs(allDocs);
    } catch (err) {
        console.error(err);
    }
}

function buildFolderTree(folders) {
    const map = {};
    const roots = [];
    for (const f of folders) {
        map[f.id] = { ...f, children: [] };
    }
    for (const f of folders) {
        if (f.parentId && map[f.parentId]) {
            map[f.parentId].children.push(map[f.id]);
        } else {
            roots.push(map[f.id]);
        }
    }
    return roots;
}

function renderFolderTreeItem(node, level = 0) {
    const indent = level * 20;
    const hasChildren = node.children && node.children.length > 0;
    const folderOpen = node._open ? '&#128194;' : '&#128193;';
    const toggle = hasChildren ? `<span class="folder-toggle" onclick="toggleFolderOpen(event, ${node.id})">${node._open ? '&#9662;' : '&#9656;'}</span>` : '<span class="folder-toggle-placeholder"></span>';
    let html = `
        <div class="folder-tree-item" style="padding-left:${indent}px">
            ${toggle}
            <span class="folder-icon">${folderOpen}</span>
            <span class="folder-name">${escapeHtml(node.name)}</span>
            <button class="folder-delete" onclick="deleteFolder(${node.id})">&#10005;</button>
        </div>
    `;
    if (hasChildren && node._open) {
        for (const child of node.children) {
            html += renderFolderTreeItem(child, level + 1);
        }
    }
    return html;
}

function renderFolders() {
    const el = document.getElementById('foldersList');
    if (!allFolders.length) {
        el.innerHTML = '<span style="color:#999;font-size:13px;">暂无文件夹</span>';
        return;
    }
    // restore open state
    const openMap = {};
    for (const f of allFolders) {
        if (f._open) openMap[f.id] = true;
    }
    const tree = buildFolderTree(allFolders);
    // apply open state recursively
    function applyOpen(nodes) {
        for (const n of nodes) {
            if (openMap[n.id] !== undefined) n._open = openMap[n.id];
            if (n.children) applyOpen(n.children);
        }
    }
    applyOpen(tree);
    el.innerHTML = tree.map(n => renderFolderTreeItem(n)).join('');
}

window.toggleFolderOpen = function(event, id) {
    event.stopPropagation();
    const folder = allFolders.find(f => f.id === id);
    if (folder) {
        folder._open = !folder._open;
        renderFolders();
    }
};

function populateFolderParentSelect() {
    const sel = document.getElementById('folderParentSelect');
    sel.innerHTML = '<option value="">根目录</option>';
    const tree = buildFolderTree(allFolders);
    function addOptions(nodes, prefix = '') {
        for (const n of nodes) {
            sel.innerHTML += `<option value="${n.id}">${prefix}${escapeHtml(n.name)}</option>`;
            if (n.children) addOptions(n.children, prefix + '　');
        }
    }
    addOptions(tree);
}

function renderDocs(docs) {
    const tbody = document.getElementById('docsTableBody');
    if (!docs.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">暂无文档</td></tr>';
        return;
    }
    tbody.innerHTML = docs.map(d => {
        const folder = allFolders.find(f => f.id === d.folderId);
        const uploader = d.uploader ? (d.uploader.nickname || d.uploader.username) : '未知';
        const date = d.createdAt ? new Date(d.createdAt).toLocaleDateString('zh-CN') : '-';
        const size = formatSize(d.size);
        return `
            <tr>
                <td>${d.id}</td>
                <td>${escapeHtml(d.originalName)}</td>
                <td>${size}</td>
                <td>${escapeHtml(uploader)}</td>
                <td>${folder ? escapeHtml(folder.name) : '根目录'}</td>
                <td>${d.downloadCount || 0}</td>
                <td>${date}</td>
                <td>
                    <div class="btn-group">
                        <a href="/preview.html?id=${d.id}" class="btn btn-small btn-primary" target="_blank">预览</a>
                        <a href="/api/document/download/${d.id}" class="btn btn-small btn-secondary" download>下载</a>
                        <button class="btn btn-small btn-danger" onclick="deleteDoc(${d.id})">删除</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

document.getElementById('docSearch').addEventListener('input', (e) => {
    const kw = e.target.value.trim().toLowerCase();
    if (!kw) { renderDocs(allDocs); return; }
    const filtered = allDocs.filter(d => (d.originalName || '').toLowerCase().includes(kw));
    renderDocs(filtered);
});

async function deleteDoc(id) {
    if (!confirm('确定删除该文档？')) return;
    const res = await apiFetch(`/api/admin/documents/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) loadDocuments();
    else alert(data.message || '删除失败');
}

window.deleteDoc = deleteDoc;

async function deleteFolder(id) {
    if (!confirm('确定删除该文件夹？文件夹及其子目录、文件将被永久删除！')) return;
    const res = await apiFetch(`/api/admin/folders/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) loadDocuments();
    else alert(data.detail ? `删除失败: ${data.detail}` : (data.message || '删除失败'));
}

window.deleteFolder = deleteFolder;

document.getElementById('createFolderBtn').addEventListener('click', () => {
    document.getElementById('folderName').value = '';
    populateFolderParentSelect();
    document.getElementById('folderParentSelect').value = '';
    document.getElementById('createFolderModal').classList.add('show');
});

document.getElementById('confirmCreateFolderBtn').addEventListener('click', async () => {
    const name = document.getElementById('folderName').value.trim();
    const parentId = document.getElementById('folderParentSelect').value;
    if (!name) { alert('请输入文件夹名称'); return; }
    const res = await apiFetch('/api/admin/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parentId: parentId || undefined })
    });
    const data = await res.json();
    if (res.ok) {
        document.getElementById('createFolderModal').classList.remove('show');
        loadDocuments();
    } else {
        alert(data.message || '创建失败');
    }
});

// ===== 消息管理 =====
let allMessages = [];

async function loadMessages() {
    try {
        const res = await apiFetch('/api/admin/messages');
        allMessages = await res.json();
        renderMessages(allMessages);
    } catch (err) {
        document.getElementById('messagesTableBody').innerHTML = '<tr><td colspan="5" class="empty-state">加载失败</td></tr>';
    }
}

function renderMessages(msgs) {
    const tbody = document.getElementById('messagesTableBody');
    if (!msgs.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">暂无消息</td></tr>';
        return;
    }
    tbody.innerHTML = msgs.map(m => {
        const sender = m.sender ? (m.sender.nickname || m.sender.username) : '未知';
        const time = m.createdAt ? new Date(m.createdAt).toLocaleString('zh-CN') : '-';
        return `
            <tr>
                <td>${m._id}</td>
                <td>${escapeHtml(sender)}</td>
                <td style="max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(m.content)}</td>
                <td>${time}</td>
                <td>
                    <button class="btn btn-small btn-danger" onclick="deleteMessage(${m._id})">删除</button>
                </td>
            </tr>
        `;
    }).join('');
}

document.getElementById('msgSearch').addEventListener('input', (e) => {
    const kw = e.target.value.trim().toLowerCase();
    if (!kw) { renderMessages(allMessages); return; }
    const filtered = allMessages.filter(m => (m.content || '').toLowerCase().includes(kw));
    renderMessages(filtered);
});

async function deleteMessage(id) {
    if (!confirm('确定删除该消息？')) return;
    const res = await apiFetch(`/api/admin/messages/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) loadMessages();
    else alert(data.message || '删除失败');
}

window.deleteMessage = deleteMessage;

// ===== 工具函数 =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// 弹窗关闭
document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.target.closest('.modal').classList.remove('show');
    });
});

// 退出登录
document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/index.html';
});

// 初始化
showPage('dashboard');
