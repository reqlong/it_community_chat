const token = localStorage.getItem('token');
let user = JSON.parse(localStorage.getItem('user') || '{}');

if (!token) {
    window.location.href = '/index.html';
}

// DOM 元素
const currentUserAvatar = document.getElementById('currentUserAvatar');
const currentUserName = document.getElementById('currentUserName');
const usersList = document.getElementById('usersList');
const onlineCount = document.getElementById('onlineCount');
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const typingIndicator = document.getElementById('typingIndicator');
const documentsList = document.getElementById('documentsList');

// 初始化用户信息
function initUserInfo() {
    currentUserAvatar.src = user.avatar || '/uploads/avatars/default-avatar.png';
    currentUserName.textContent = user.nickname || user.username;
    const uploadBtn = document.getElementById('uploadDocBtn');
    if (user.role === 'admin') {
        document.getElementById('adminLink').style.display = 'inline-block';
        if (uploadBtn) uploadBtn.style.display = 'inline-block';
    } else {
        document.getElementById('adminLink').style.display = 'none';
        if (uploadBtn) uploadBtn.style.display = 'none';
    }
}

async function refreshUserInfo() {
    try {
        const res = await fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) {
            const data = await res.json();
            user = data;
            localStorage.setItem('user', JSON.stringify(user));
        }
    } catch (e) {
        console.error('获取用户信息失败', e);
    }
    initUserInfo();
}
refreshUserInfo();

// Socket.IO 连接
const socket = io({ auth: { token } });

let users = [];
let typingTimer = null;
let currentTypingUsers = new Set();

// 连接事件
socket.on('connect', () => {
    console.log('已连接到服务器');
});

socket.on('connect_error', (err) => {
    if (err.message === '认证失败') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/index.html';
    }
});

// 用户列表更新
socket.on('usersList', (data) => {
    users = data;
    renderUsersList();
});

socket.on('userOnline', (data) => {
    const idx = users.findIndex(u => u._id === data.userId || u._id === data.userId.toString());
    if (idx >= 0) {
        users[idx].isOnline = true;
        users[idx].gender = data.gender;
    } else {
        users.push({
            _id: data.userId,
            username: data.username,
            nickname: data.nickname,
            gender: data.gender,
            avatar: data.avatar,
            isOnline: true
        });
    }
    renderUsersList();
});

socket.on('userOffline', (data) => {
    const idx = users.findIndex(u => u._id === data.userId || u._id === data.userId.toString());
    if (idx >= 0) {
        users[idx].isOnline = false;
        users[idx].lastSeen = new Date();
        users[idx].gender = data.gender;
    }
    renderUsersList();
});

socket.on('userRoleChanged', (data) => {
    const idx = users.findIndex(u => u._id === data.userId || u._id === data.userId.toString());
    if (idx >= 0) {
        users[idx].role = data.role;
        users[idx].nickname = data.nickname;
        users[idx].gender = data.gender;
    } else {
        users.push({
            _id: data.userId,
            username: data.username,
            nickname: data.nickname,
            gender: data.gender,
            avatar: data.avatar,
            role: data.role,
            isOnline: false
        });
    }
    renderUsersList();

    // 如果当前登录用户角色被变更，同步更新本地状态和UI
    if (data.userId === user.id || data.userId === user.id?.toString()) {
        user.role = data.role;
        localStorage.setItem('user', JSON.stringify(user));
        const uploadBtn = document.getElementById('uploadDocBtn');
        if (data.role === 'admin') {
            document.getElementById('adminLink').style.display = 'inline-block';
            if (uploadBtn) uploadBtn.style.display = 'inline-block';
        } else {
            document.getElementById('adminLink').style.display = 'none';
            if (uploadBtn) uploadBtn.style.display = 'none';
        }
    }
});

function getGenderIcon(gender) {
    if (gender === 'male') return '<span class="gender-badge male">&#9794;</span>';
    if (gender === 'female') return '<span class="gender-badge female">&#9792;</span>';
    if (gender === 'gay') return '<span class="gender-badge gay">&#9893;</span>';
    return '';
}

function renderUsersList() {
    const online = users.filter(u => u.isOnline);
    const offline = users.filter(u => !u.isOnline);
    onlineCount.textContent = `${online.length}/${users.length} 在线`;

    const sorted = [...online, ...offline];

    usersList.innerHTML = sorted.map(u => {
        const isMe = (u._id === user.id || u._id === user.id?.toString());
        const displayName = u.nickname || u.username;
        const statusClass = u.isOnline ? 'online' : 'offline';
        const genderIcon = getGenderIcon(u.gender);
        const adminClass = u.role === 'admin' ? 'admin-name' : '';
        return `
            <div class="user-item ${statusClass}">
                <div class="avatar-wrapper">
                    <img src="${u.avatar || '/uploads/avatars/default-avatar.png'}" alt="" class="avatar">
                    <span class="status-dot"></span>
                </div>
                <div class="user-info-text">
                    <div class="username ${adminClass}">${genderIcon}${displayName} ${isMe ? '(我)' : ''}</div>
                    <div class="nickname">@${u.username}</div>
                </div>
            </div>
        `;
    }).join('');
}

// 聊天消息
socket.on('history', (messages) => {
    messagesContainer.innerHTML = '';
    messages.forEach(msg => appendMessage(msg));
    requestAnimationFrame(() => scrollToBottom());
});

socket.on('newMessage', (message) => {
    appendMessage(message);
    requestAnimationFrame(() => scrollToBottom());
});

socket.on('userTyping', (data) => {
    if (data.isTyping) {
        currentTypingUsers.add(data.nickname || data.username);
    } else {
        currentTypingUsers.delete(data.nickname || data.username);
    }
    updateTypingIndicator();
});

function updateTypingIndicator() {
    if (!typingIndicator) return;
    const arr = Array.from(currentTypingUsers);
    if (arr.length === 0) {
        typingIndicator.textContent = '';
    } else if (arr.length === 1) {
        typingIndicator.textContent = `${arr[0]} 正在输入...`;
    } else {
        typingIndicator.textContent = `${arr.slice(0, 2).join('、')} 等正在输入...`;
    }
}

function appendMessage(message) {
    const isOwn = message.sender._id === user.id || message.sender._id === user.id?.toString();
    const isSystem = message.type === 'system';

    if (isSystem) {
        const div = document.createElement('div');
        div.className = 'message-item system';
        div.innerHTML = `<span class="system-text">${message.content}</span>`;
        messagesContainer.appendChild(div);
        return;
    }

    const div = document.createElement('div');
    div.className = `message-item ${isOwn ? 'own' : ''}`;
    const time = new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const senderName = message.sender.nickname || message.sender.username;
    const genderIcon = getGenderIcon(message.sender.gender);

    const adminClass = message.sender.role === 'admin' ? 'admin-name' : '';
    const senderInfo = isOwn ? '' : `<div class="message-sender">${genderIcon}<span class="${adminClass}">${senderName}</span><span class="message-time-inline">${time}</span></div>`;
    const contentHtml = wrapEmojis(escapeHtml(message.content)).replace(/\n/g, '<br>');
    div.innerHTML = `
        <img src="${message.sender.avatar || '/uploads/avatars/default-avatar.png'}" alt="" class="message-avatar ${isOwn ? 'message-avatar-self' : ''}">
        <div class="message-content">
            ${senderInfo}
            <div class="message-text">${contentHtml}</div>
        </div>
    `;
    if (isOwn) {
        div.querySelector('.message-avatar-self').addEventListener('click', openProfileModal);
    }
    messagesContainer.appendChild(div);
}

function addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'message-item system';
    div.innerHTML = `<span class="system-text">${escapeHtml(text)}</span>`;
    messagesContainer.appendChild(div);
    scrollToBottom();
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function wrapEmojis(text) {
    return text.replace(/\p{Extended_Pictographic}/gu, '<span class="message-emoji">$&</span>');
}

// 发送消息
function sendMessage() {
    const content = messageInput.value.trim();
    if (!content) return;

    socket.emit('chatMessage', { content, type: 'text' });
    messageInput.value = '';
    messageInput.style.height = 'auto';
    socket.emit('typing', { isTyping: false });
}

sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        sendMessage();
    }
});

messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';

    socket.emit('typing', { isTyping: true });
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        socket.emit('typing', { isTyping: false });
    }, 2000);
});

// Emoji 面板
const emojiBtn = document.getElementById('emojiBtn');
const emojiPanel = document.getElementById('emojiPanel');
const emojis = ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👿','👹','👺','🤡','💩','👻','💀','☠️','👽','👾','🤖','🎃','😺','😸','😹','😻','😼','😽','🙀','😿','😾','👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁️','👅','👄','👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓','👴','👵','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟'];

emojiPanel.innerHTML = emojis.map(e => `<span class="emoji-item">${e}</span>`).join('');

emojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    emojiPanel.classList.toggle('show');
});

emojiPanel.addEventListener('click', (e) => {
    if (e.target.classList.contains('emoji-item')) {
        const emoji = e.target.textContent;
        const start = messageInput.selectionStart;
        const end = messageInput.selectionEnd;
        const text = messageInput.value;
        messageInput.value = text.slice(0, start) + emoji + text.slice(end);
        messageInput.selectionStart = messageInput.selectionEnd = start + emoji.length;
        messageInput.focus();
        messageInput.dispatchEvent(new Event('input'));
    }
});

document.addEventListener('click', (e) => {
    if (!emojiPanel.contains(e.target) && e.target !== emojiBtn) {
        emojiPanel.classList.remove('show');
    }
});

// 退出登录
document.getElementById('logoutBtn').addEventListener('click', () => {
    socket.disconnect();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/index.html';
});

// 编辑资料弹窗
const profileModal = document.getElementById('profileModal');
const previewAvatar = document.getElementById('previewAvatar');
const profileUsername = document.getElementById('profileUsername');
const nicknameInput = document.getElementById('nicknameInput');
const avatarInput = document.getElementById('avatarInput');

function getSelectedGender() {
    const checked = document.querySelector('input[name="gender"]:checked');
    return checked ? checked.value : '';
}

function setSelectedGender(gender) {
    document.querySelectorAll('input[name="gender"]').forEach(r => {
        r.checked = r.value === gender;
    });
}

function openProfileModal() {
    previewAvatar.src = user.avatar || '/uploads/avatars/default-avatar.png';
    profileUsername.textContent = user.username;
    nicknameInput.value = user.nickname || '';
    setSelectedGender(user.gender || '');
    // 清空密码字段
    document.getElementById('oldPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmNewPassword').value = '';
    profileModal.classList.add('show');
}

document.getElementById('currentUserAvatar').addEventListener('click', openProfileModal);

previewAvatar.addEventListener('click', () => {
    avatarInput.click();
});

avatarInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            previewAvatar.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }
});

function checkNicknameLen(nickname) {
    let charLen = 0;
    for (const ch of nickname) {
        charLen += (ch.charCodeAt(0) > 127) ? 2 : 1;
    }
    return charLen;
}

document.getElementById('saveProfileBtn').addEventListener('click', async () => {
    try {
        let updated = false;

        // 更新昵称
        const nickname = nicknameInput.value.trim();
        if (nickname && nickname !== user.nickname) {
            if (checkNicknameLen(nickname) > 16) {
                alert('昵称最长8个汉字或16个字符');
                return;
            }
            const res = await fetch('/api/user/nickname', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ nickname })
            });
            const data = await res.json();
            if (res.ok) {
                user.nickname = data.user.nickname;
                currentUserName.textContent = user.nickname || user.username;
                updated = true;
            } else {
                alert(data.message || '昵称修改失败');
                return;
            }
        }

        // 更新性别
        const gender = getSelectedGender();
        if (gender && gender !== user.gender) {
            const res = await fetch('/api/user/gender', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ gender })
            });
            const data = await res.json();
            if (res.ok) {
                user.gender = data.user.gender;
                updated = true;
            } else {
                alert(data.message || '性别设置失败');
                return;
            }
        }

        // 更新头像
        const file = avatarInput.files[0];
        if (file) {
            const formData = new FormData();
            formData.append('avatar', file);
            const res = await fetch('/api/user/avatar', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token },
                body: formData
            });
            const data = await res.json();
            if (res.ok) {
                user.avatar = data.user.avatar;
                currentUserAvatar.src = user.avatar;
                updated = true;
            } else {
                alert(data.message || '头像更换失败');
                return;
            }
        }

        // 修改密码
        const oldPassword = document.getElementById('oldPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmNewPassword = document.getElementById('confirmNewPassword').value;

        if (oldPassword || newPassword || confirmNewPassword) {
            if (!oldPassword || !newPassword || !confirmNewPassword) {
                alert('请填写完整的密码信息');
                return;
            }
            if (newPassword !== confirmNewPassword) {
                alert('两次输入的新密码不一致');
                return;
            }
            if (newPassword.length < 6) {
                alert('新密码长度至少为6个字符');
                return;
            }

            const res = await fetch('/api/user/password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ oldPassword, newPassword })
            });
            const data = await res.json();
            if (res.ok) {
                alert('密码修改成功');
                updated = true;
                document.getElementById('oldPassword').value = '';
                document.getElementById('newPassword').value = '';
                document.getElementById('confirmNewPassword').value = '';
            } else {
                alert(data.message || '密码修改失败');
                return;
            }
        }

        localStorage.setItem('user', JSON.stringify(user));
        profileModal.classList.remove('show');
        avatarInput.value = '';
    } catch (err) {
        alert('保存失败，请重试');
    }
});

// 弹窗关闭
document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.target.closest('.modal').classList.remove('show');
    });
});

// 上传文档弹窗
const uploadModal = document.getElementById('uploadModal');

document.getElementById('uploadDocBtn').addEventListener('click', () => {
    uploadModal.classList.add('show');
});

let currentFolderId = '';
let allFolders = [];

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

function renderFolderTreeNode(node, level = 0) {
    const indent = level * 16;
    const hasChildren = node.children && node.children.length > 0;
    const isOpen = node._open;
    const isActive = currentFolderId === String(node.id);
    const folderIcon = isOpen ? '&#128194;' : '&#128193;';
    const toggle = hasChildren
        ? `<span class="folder-tree-toggle" onclick="event.stopPropagation();toggleFolderNode(${node.id})">${isOpen ? '&#9662;' : '&#9656;'}</span>`
        : '<span class="folder-tree-toggle-placeholder"></span>';
    let html = `
        <div class="folder-tree-item ${isActive ? 'active' : ''}" style="padding-left:${indent}px" data-folder="${node.id}" onclick="switchFolder('${node.id}')">
            ${toggle}
            <span class="folder-tree-icon">${folderIcon}</span>
            <span class="folder-tree-name">${escapeHtml(node.name)}</span>
        </div>
    `;
    if (hasChildren && isOpen) {
        for (const child of node.children) {
            html += renderFolderTreeNode(child, level + 1);
        }
    }
    return html;
}

function renderFolderNav(folders) {
    allFolders = folders || [];
    const nav = document.getElementById('folderNav');
    // preserve open state
    const openMap = {};
    for (const f of allFolders) {
        if (f._open) openMap[f.id] = true;
    }
    const tree = buildFolderTree(allFolders);
    function applyOpen(nodes) {
        for (const n of nodes) {
            if (openMap[n.id] !== undefined) n._open = openMap[n.id];
            if (n.children) applyOpen(n.children);
        }
    }
    applyOpen(tree);

    let html = `<div class="folder-tree-item folder-tree-root ${currentFolderId === '' ? 'active' : ''}" data-folder="" onclick="switchFolder('')">
        <span class="folder-tree-icon">&#127968;</span>
        <span class="folder-tree-name">根目录</span>
    </div>`;
    for (const root of tree) {
        html += renderFolderTreeNode(root);
    }
    nav.innerHTML = html;
}

window.toggleFolderNode = function(id) {
    const folder = allFolders.find(f => f.id === id);
    if (folder) {
        folder._open = !folder._open;
        renderFolderNav(allFolders);
    }
};

window.switchFolder = function(folderId) {
    currentFolderId = String(folderId);
    renderFolderNav(allFolders);
    loadDocuments();
};

document.getElementById('confirmUploadBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('documentInput');
    const description = document.getElementById('docDescription').value.trim();
    const folderId = document.getElementById('uploadFolderSelect').value;

    if (!fileInput.files[0]) {
        alert('请选择要上传的文件');
        return;
    }

    const formData = new FormData();
    formData.append('document', fileInput.files[0]);
    formData.append('description', description);
    formData.append('folderId', folderId);

    try {
        const res = await fetch('/api/document/upload', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token },
            body: formData
        });

        const data = await res.json();
        if (res.ok) {
            fileInput.value = '';
            document.getElementById('docDescription').value = '';
            document.getElementById('uploadFolderSelect').value = '';
            uploadModal.classList.remove('show');
            loadDocuments();
        } else {
            alert(data.message || '上传失败');
        }
    } catch (err) {
        alert('上传失败，请重试');
    }
});

// 加载文档列表
async function loadDocuments() {
    try {
        const url = currentFolderId ? `/api/document/list?folderId=${currentFolderId}` : '/api/document/list';
        const res = await fetch(url, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        renderFolderNav(data.folders);
        updateUploadFolderSelect(data.folders);
        renderDocuments(data.documents);
    } catch (err) {
        documentsList.innerHTML = '<div class="empty-state">加载文档失败</div>';
    }
}

function updateUploadFolderSelect(folders) {
    const sel = document.getElementById('uploadFolderSelect');
    sel.innerHTML = '<option value="">根目录</option>';
    const tree = buildFolderTree(folders || []);
    function addOptions(nodes, prefix = '') {
        for (const n of nodes) {
            sel.innerHTML += `<option value="${n.id}">${prefix}${escapeHtml(n.name)}</option>`;
            if (n.children) addOptions(n.children, prefix + '　');
        }
    }
    addOptions(tree);
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function renderDocuments(docs) {
    if (!docs || docs.length === 0) {
        documentsList.innerHTML = '<div class="empty-state">暂无文档，点击上方按钮上传</div>';
        return;
    }

    documentsList.innerHTML = docs.map(doc => {
        const uploader = doc.uploader?.nickname || doc.uploader?.username || '未知用户';
        const date = new Date(doc.createdAt).toLocaleDateString('zh-CN');
        const isOwner = doc.uploader?._id === user.id || doc.uploader?._id === user.id?.toString();
        const hasDesc = doc.description && doc.description.trim().length > 0;

        return `
            <div class="document-item" onclick="toggleDocActions('${doc._id}')">
                <div class="doc-row">
                    <span class="doc-icon">&#128196;</span>
                    <span class="doc-name">${escapeHtml(doc.originalName)}</span>
                    <span class="doc-size">${formatSize(doc.size)}</span>
                </div>
                <div class="doc-actions" id="doc-actions-${doc._id}" style="display:none;" onclick="event.stopPropagation();">
                    <a href="/preview.html?id=${doc._id}" class="btn btn-small btn-primary" target="_blank">预览</a>
                    <button class="btn btn-small btn-info" onclick="event.stopPropagation(); toggleDocDesc('${doc._id}')">描述</button>
                    <a href="/api/document/download/${doc._id}" class="btn btn-small btn-secondary" download>下载</a>
                    ${isOwner ? `<button class="btn btn-small btn-danger" onclick="deleteDocument('${doc._id}')">删除</button>` : ''}
                </div>
                <div class="doc-desc-panel" id="doc-desc-${doc._id}" style="display:none;" onclick="event.stopPropagation();">
                    ${hasDesc ? escapeHtml(doc.description) : '<span class="doc-desc-empty">暂无描述</span>'}
                </div>
            </div>
        `;
    }).join('');
}

window.toggleDocActions = function(id) {
    const el = document.getElementById('doc-actions-' + id);
    if (!el) return;
    const all = document.querySelectorAll('.doc-actions');
    all.forEach(a => { if (a !== el) a.style.display = 'none'; });
    el.style.display = el.style.display === 'none' ? 'flex' : 'none';
    // 收起描述面板
    const desc = document.getElementById('doc-desc-' + id);
    if (desc) desc.style.display = 'none';
};

window.toggleDocDesc = function(id) {
    const el = document.getElementById('doc-desc-' + id);
    if (!el) return;
    const all = document.querySelectorAll('.doc-desc-panel');
    all.forEach(a => { if (a !== el) a.style.display = 'none'; });
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// 删除文档（挂载到 window 供内联 onclick 使用）
window.deleteDocument = async function(id) {
    if (!confirm('确定要删除此文档吗？')) return;

    try {
        const res = await fetch(`/api/document/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        });

        if (res.ok) {
            loadDocuments();
        } else {
            const data = await res.json();
            alert(data.message || '删除失败');
        }
    } catch (err) {
        alert('删除失败，请重试');
    }
};

// 初始化
loadDocuments();
