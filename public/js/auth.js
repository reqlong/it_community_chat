const API_URL = '';

// 检查是否已登录
const token = localStorage.getItem('token');
if (token) {
    window.location.href = '/chat.html';
}

// 标签切换
const tabBtns = document.querySelectorAll('.tab-btn');
const forms = document.querySelectorAll('.auth-form');

function showTab(tab) {
    tabBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    forms.forEach(form => {
        form.classList.toggle('active', form.id === tab + 'Form');
    });
}

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
});

function showMessage(text, type) {
    const msg = document.getElementById('authMessage');
    msg.textContent = text;
    msg.className = 'message show ' + type;
    setTimeout(() => msg.classList.remove('show'), 4000);
}

// 登录
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            showMessage('登录成功，正在跳转...', 'success');
            setTimeout(() => window.location.href = '/chat.html', 500);
        } else {
            showMessage(data.message || '登录失败', 'error');
        }
    } catch (err) {
        showMessage('网络错误，请稍后重试', 'error');
    }
});

// 注册
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('registerUsername').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        showMessage('用户名只能包含字母、数字和下划线', 'error');
        return;
    }

    if (password !== confirmPassword) {
        showMessage('两次输入的密码不一致', 'error');
        return;
    }

    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            showMessage('注册成功，正在跳转...', 'success');
            setTimeout(() => window.location.href = '/chat.html', 500);
        } else {
            showMessage(data.message || '注册失败', 'error');
        }
    } catch (err) {
        showMessage('网络错误，请稍后重试', 'error');
    }
});
