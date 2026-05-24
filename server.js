require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const mammoth = require('mammoth');
const iconv = require('iconv-lite');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const JWT_SECRET = process.env.JWT_SECRET || 'it-community-chat-secret-key-2024';
const PORT = process.env.PORT || 3000;

// 确保上传目录存在
['uploads/avatars', 'uploads/documents'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// 创建默认头像
const defaultAvatarPath = path.join(__dirname, 'uploads', 'avatars', 'default-avatar.png');
if (!fs.existsSync(defaultAvatarPath)) {
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="#e0e0e0"/>
    <circle cx="50" cy="40" r="20" fill="#9e9e9e"/>
    <ellipse cx="50" cy="90" rx="35" ry="30" fill="#9e9e9e"/>
  </svg>`;
  fs.writeFileSync(defaultAvatarPath, svgContent);
}

// ===== MySQL 数据库 =====
const pool = mysql.createPool({
  host: '154.219.118.224',
  port: 3306,
  user: 'root',
  password: 'Huayun@123',
  database: 'it_community_chat',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
});

async function initDb() {
  const conn = await pool.getConnection();
  try {
    await conn.execute(`CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      nickname VARCHAR(50),
      gender VARCHAR(10) DEFAULT '',
      avatar VARCHAR(255) DEFAULT '/uploads/avatars/default-avatar.png',
      role VARCHAR(20) DEFAULT 'user',
      banned TINYINT(1) DEFAULT 0,
      isOnline TINYINT(1) DEFAULT 0,
      lastSeen BIGINT DEFAULT 0,
      socketId VARCHAR(100),
      createdAt BIGINT DEFAULT 0,
      INDEX idx_online (isOnline),
      INDEX idx_role (role)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await conn.execute(`CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      senderId INT NOT NULL,
      content TEXT NOT NULL,
      type VARCHAR(20) DEFAULT 'text',
      createdAt BIGINT DEFAULT 0,
      INDEX idx_sender (senderId),
      INDEX idx_created (createdAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await conn.execute(`CREATE TABLE IF NOT EXISTS folders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      parentId INT DEFAULT NULL,
      createdAt BIGINT DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await conn.execute(`CREATE TABLE IF NOT EXISTS documents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      originalName VARCHAR(255) NOT NULL,
      filename VARCHAR(255) NOT NULL,
      path TEXT NOT NULL,
      size INT NOT NULL,
      mimetype VARCHAR(100) NOT NULL,
      uploaderId INT NOT NULL,
      folderId INT DEFAULT NULL,
      description TEXT,
      downloadCount INT DEFAULT 0,
      createdAt BIGINT DEFAULT 0,
      INDEX idx_uploader (uploaderId),
      INDEX idx_folder (folderId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    // 更新未设置头像的现有用户
    await conn.execute("UPDATE users SET avatar = '/uploads/avatars/default-avatar.png' WHERE avatar IS NULL OR avatar = ''");

    // 服务器重启时重置所有用户在线状态
    await conn.execute("UPDATE users SET isOnline = 0, socketId = NULL");

    // 创建默认 admin 账号
    const [rows] = await conn.execute('SELECT id FROM users WHERE username = ?', ['admin']);
    if (rows.length === 0) {
      const hashed = await bcrypt.hash('admin123', 10);
      const now = Date.now();
      await conn.execute(
        'INSERT INTO users (username, password, nickname, avatar, role, banned, isOnline, lastSeen, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['admin', hashed, '管理员', '/uploads/avatars/default-avatar.png', 'admin', 0, 0, now, now]
      );
      console.log('默认管理员账号已创建: admin / admin123');
    }
  } finally {
    conn.release();
  }
}

// 中间件
app.use(cors());
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self'; media-src 'self'");
  next();
});
app.use((req, res, next) => {
  if (req.path.includes('//')) {
    const cleanPath = req.path.replace(/\/+/g, '/');
    return res.redirect(301, cleanPath + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''));
  }
  next();
});
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// 认证中间件
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '') || req.query?.token;
    if (!token) return res.status(401).json({ message: '未提供认证令牌' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [decoded.userId]);
    if (rows.length === 0) return res.status(401).json({ message: '用户不存在' });
    if (rows[0].banned) return res.status(403).json({ message: '账号已被封禁' });

    req.user = rows[0];
    next();
  } catch (error) {
    res.status(401).json({ message: '认证失败' });
  }
};

// 管理员认证中间件
const adminAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: '未提供认证令牌' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [decoded.userId]);
    if (rows.length === 0) return res.status(401).json({ message: '用户不存在' });
    if (rows[0].role !== 'admin') return res.status(403).json({ message: '无权访问' });
    if (rows[0].banned) return res.status(403).json({ message: '账号已被封禁' });

    req.user = rows[0];
    next();
  } catch (error) {
    res.status(401).json({ message: '认证失败' });
  }
};

// Multer 配置
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/avatars/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

const docStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/documents/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const docUpload = multer({ storage: docStorage, limits: { fileSize: 50 * 1024 * 1024 } });

function userToJson(user, isAdmin = false) {
  const defaultAvatar = '/uploads/avatars/default-avatar.png';
  let avatar = user.avatar || defaultAvatar;
  if (avatar !== defaultAvatar) {
    const avatarFile = path.join(__dirname, avatar.replace(/^\//, ''));
    if (!fs.existsSync(avatarFile)) {
      avatar = defaultAvatar;
      pool.execute('UPDATE users SET avatar = ? WHERE id = ?', [avatar, user.id]).catch(() => {});
    }
  }
  const base = {
    id: user.id,
    _id: user.id,
    username: user.username,
    nickname: user.nickname,
    gender: user.gender || '',
    avatar,
    isOnline: !!user.isOnline,
    lastSeen: user.lastSeen ? new Date(user.lastSeen) : new Date(),
    socketId: user.socketId,
    role: user.role || 'user',
    banned: !!user.banned
  };
  if (isAdmin) {
    base.createdAt = user.createdAt;
  }
  return base;
}

// ===== 路由 =====

// 注册
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: '用户名和密码不能为空' });
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ message: '用户名只能包含字母、数字和下划线' });
    if (username.length < 3 || username.length > 20) return res.status(400).json({ message: '用户名长度应为3-20个字符' });
    if (password.length < 6) return res.status(400).json({ message: '密码长度至少为6个字符' });

    const [existing] = await pool.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) return res.status(400).json({ message: '用户名已存在' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const now = Date.now();
    const [result] = await pool.execute(
      'INSERT INTO users (username, password, nickname, avatar, role, banned, isOnline, lastSeen, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [username, hashedPassword, username, '/uploads/avatars/default-avatar.png', 'user', 0, 0, now, now]
    );

    const [users] = await pool.execute('SELECT * FROM users WHERE id = ?', [result.insertId]);
    const token = jwt.sign({ userId: users[0].id }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: userToJson(users[0]) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 登录
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: '用户名和密码不能为空' });

    const [rows] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);
    if (rows.length === 0) return res.status(400).json({ message: '用户名或密码错误' });

    const user = rows[0];
    if (user.banned) return res.status(403).json({ message: '账号已被封禁，请联系管理员' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: '用户名或密码错误' });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: userToJson(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 获取当前用户
app.get('/api/auth/me', auth, (req, res) => {
  res.json(userToJson(req.user));
});

// 修改昵称
app.patch('/api/user/nickname', auth, async (req, res) => {
  try {
    const { nickname } = req.body;
    if (!nickname || nickname.trim().length === 0) return res.status(400).json({ message: '昵称不能为空' });

    // 计算字符长度：中文算2，英文/数字算1，最长16（即8中文或16英文）
    let charLen = 0;
    for (const ch of nickname) {
      charLen += (ch.charCodeAt(0) > 127) ? 2 : 1;
    }
    if (charLen > 16) return res.status(400).json({ message: '昵称最长8个汉字或16个字符' });

    await pool.execute('UPDATE users SET nickname = ? WHERE id = ?', [nickname.trim(), req.user.id]);
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.user.id]);
    res.json({ message: '昵称修改成功', user: userToJson(rows[0]) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 修改性别
app.patch('/api/user/gender', auth, async (req, res) => {
  try {
    const { gender } = req.body;
    if (!gender || !['male', 'female', 'gay'].includes(gender)) return res.status(400).json({ message: '性别选择无效' });

    await pool.execute('UPDATE users SET gender = ? WHERE id = ?', [gender, req.user.id]);
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.user.id]);
    res.json({ message: '性别设置成功', user: userToJson(rows[0]) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 修改密码
app.post('/api/user/password', auth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ message: '旧密码和新密码不能为空' });
    if (newPassword.length < 6) return res.status(400).json({ message: '新密码长度至少为6个字符' });

    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const isMatch = await bcrypt.compare(oldPassword, rows[0].password);
    if (!isMatch) return res.status(400).json({ message: '旧密码错误' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.execute('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.user.id]);
    res.json({ message: '密码修改成功' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 更换头像
app.post('/api/user/avatar', auth, avatarUpload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: '请选择要上传的头像' });
    const avatarPath = '/uploads/avatars/' + req.file.filename;
    const defaultAvatar = '/uploads/avatars/default-avatar.png';

    // 删除旧头像文件
    if (req.user.avatar && req.user.avatar !== defaultAvatar) {
      const oldPath = path.join(__dirname, req.user.avatar.replace(/^\//, ''));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    await pool.execute('UPDATE users SET avatar = ? WHERE id = ?', [avatarPath, req.user.id]);
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.user.id]);
    res.json({ message: '头像更换成功', user: userToJson(rows[0]) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 获取所有用户
app.get('/api/user/list', auth, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM users ORDER BY isOnline DESC, lastSeen DESC');
    res.json(rows.map(u => userToJson(u)));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 上传文档
app.post('/api/document/upload', auth, docUpload.single('document'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: '请选择要上传的文档' });
    const { description = '', folderId = null } = req.body;

    const now = Date.now();
    const [result] = await pool.execute(
      'INSERT INTO documents (originalName, filename, path, size, mimetype, uploaderId, folderId, description, downloadCount, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.file.originalname, req.file.filename, req.file.path, req.file.size, req.file.mimetype, req.user.id, folderId || null, description, 0, now]
    );

    const [docs] = await pool.execute('SELECT * FROM documents WHERE id = ?', [result.insertId]);
    const uploader = userToJson(req.user);
    res.status(201).json({
      message: '文档上传成功',
      document: { ...docs[0], _id: docs[0].id, uploader }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 获取文档列表
app.get('/api/document/list', auth, async (req, res) => {
  try {
    const { folderId } = req.query;
    let sql = 'SELECT * FROM documents';
    let params = [];
    if (folderId !== undefined && folderId !== '') {
      sql += ' WHERE folderId = ?';
      params.push(folderId);
    } else {
      sql += ' WHERE folderId IS NULL';
    }
    sql += ' ORDER BY createdAt DESC';
    const [rows] = await pool.execute(sql, params);

    // 同时返回所有文件夹
    const [folders] = await pool.execute('SELECT * FROM folders ORDER BY name ASC');

    const usersMap = {};
    const docs = [];
    for (const doc of rows) {
      if (!usersMap[doc.uploaderId]) {
        const [u] = await pool.execute('SELECT * FROM users WHERE id = ?', [doc.uploaderId]);
        usersMap[doc.uploaderId] = u.length > 0 ? userToJson(u[0]) : null;
      }
      docs.push({ ...doc, _id: doc.id, uploader: usersMap[doc.uploaderId] });
    }
    res.json({ documents: docs, folders: folders.map(f => ({ ...f, _id: f.id })) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 下载文档
app.get('/api/document/download/:id', auth, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: '文档不存在' });
    const doc = rows[0];
    if (!fs.existsSync(doc.path)) return res.status(404).json({ message: '文件不存在' });

    await pool.execute('UPDATE documents SET downloadCount = downloadCount + 1 WHERE id = ?', [doc.id]);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.originalName)}"; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`);
    res.setHeader('Content-Type', doc.mimetype);
    fs.createReadStream(doc.path).pipe(res);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 内联查看文档（图片/PDF预览用）
app.get('/api/document/inline/:id', auth, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: '文档不存在' });
    const doc = rows[0];
    if (!fs.existsSync(doc.path)) return res.status(404).json({ message: '文件不存在' });

    res.setHeader('Content-Type', doc.mimetype);
    fs.createReadStream(doc.path).pipe(res);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 获取单个文档信息
app.get('/api/document/:id', auth, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: '文档不存在' });
    const doc = rows[0];
    const [uploaderRows] = await pool.execute('SELECT * FROM users WHERE id = ?', [doc.uploaderId]);
    const uploader = uploaderRows.length > 0 ? userToJson(uploaderRows[0]) : null;
    res.json({
      id: doc.id,
      _id: doc.id,
      originalName: doc.originalName,
      filename: doc.filename,
      mimetype: doc.mimetype,
      size: doc.size,
      description: doc.description,
      downloadCount: doc.downloadCount,
      createdAt: doc.createdAt,
      folderId: doc.folderId,
      uploader
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 文档预览（docx 转 HTML）
app.get('/api/document/preview-html/:id', auth, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: '文档不存在' });
    const doc = rows[0];
    if (!fs.existsSync(doc.path)) return res.status(404).json({ message: '文件不存在' });

    const ext = path.extname(doc.originalName).toLowerCase();
    if (ext === '.docx') {
      const result = await mammoth.convertToHtml({ path: doc.path });
      return res.json({ type: 'html', content: result.value, originalName: doc.originalName });
    }

    const textExts = ['.txt', '.js', '.java', '.py', '.html', '.htm', '.css', '.md', '.json', '.xml', '.sql', '.cpp', '.c', '.h', '.hpp', '.go', '.ts', '.jsx', '.tsx', '.php', '.rb', '.sh', '.bash', '.yaml', '.yml', '.ini', '.conf', '.log', '.vue', '.cs', '.rs', '.swift', '.kt', '.r', '.m', '.scala', '.pl', '.lua', '.ps1'];
    if (textExts.includes(ext)) {
      const buffer = fs.readFileSync(doc.path);
      let content = buffer.toString('utf-8');
      if (content.includes('�')) {
        content = iconv.decode(buffer, 'gbk');
      }
      const escaped = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      res.json({ type: 'html', content: `<pre style="white-space:pre-wrap;word-break:break-word;font-family:monospace;font-size:14px;line-height:1.6;">${escaped}</pre>`, originalName: doc.originalName });
    } else {
      res.status(400).json({ type: 'unsupported', message: '该格式暂不支持在线预览', originalName: doc.originalName });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 删除文档
app.delete('/api/document/:id', auth, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: '文档不存在' });
    const doc = rows[0];
    if (doc.uploaderId !== req.user.id) return res.status(403).json({ message: '无权删除此文档' });

    if (fs.existsSync(doc.path)) fs.unlinkSync(doc.path);
    await pool.execute('DELETE FROM documents WHERE id = ?', [doc.id]);
    res.json({ message: '文档删除成功' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// ===== 管理后台 API =====

// 统计数据
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const [[userCount]] = await pool.execute('SELECT COUNT(*) as count FROM users');
    const [[onlineCount]] = await pool.execute('SELECT COUNT(*) as count FROM users WHERE isOnline = 1');
    const [[messageCount]] = await pool.execute('SELECT COUNT(*) as count FROM messages');
    const [[docCount]] = await pool.execute('SELECT COUNT(*) as count FROM documents');
    const [[folderCount]] = await pool.execute('SELECT COUNT(*) as count FROM folders');
    res.json({
      users: userCount.count,
      online: onlineCount.count,
      messages: messageCount.count,
      documents: docCount.count,
      folders: folderCount.count
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 用户列表
app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM users ORDER BY createdAt DESC');
    res.json(rows.map(u => userToJson(u, true)));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 编辑用户
app.patch('/api/admin/users/:id', adminAuth, async (req, res) => {
  try {
    const { nickname, gender, role } = req.body;
    const userId = req.params.id;
    if (parseInt(userId) === req.user.id && role && role !== 'admin') {
      return res.status(400).json({ message: '不能取消自己的管理员身份' });
    }

    const sets = [];
    const params = [];
    if (nickname !== undefined) { sets.push('nickname = ?'); params.push(nickname); }
    if (gender !== undefined) { sets.push('gender = ?'); params.push(gender); }
    if (role !== undefined) { sets.push('role = ?'); params.push(role); }
    if (sets.length === 0) return res.status(400).json({ message: '没有要修改的字段' });

    params.push(userId);
    await pool.execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
    const updatedUser = userToJson(rows[0], true);

    if (role !== undefined) {
      io.emit('userRoleChanged', {
        userId: parseInt(userId),
        role: updatedUser.role,
        nickname: updatedUser.nickname,
        username: updatedUser.username,
        avatar: updatedUser.avatar,
        gender: updatedUser.gender
      });
    }

    res.json({ message: '用户信息修改成功', user: updatedUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 封禁/解封用户
app.patch('/api/admin/users/:id/ban', adminAuth, async (req, res) => {
  try {
    const { banned } = req.body;
    const userId = req.params.id;
    if (parseInt(userId) === req.user.id) {
      return res.status(400).json({ message: '不能封禁自己' });
    }

    await pool.execute('UPDATE users SET banned = ? WHERE id = ?', [banned ? 1 : 0, userId]);
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
    res.json({ message: banned ? '用户已封禁' : '用户已解封', user: userToJson(rows[0], true) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 删除用户
app.delete('/api/admin/users/:id', adminAuth, async (req, res) => {
  try {
    const userId = req.params.id;
    if (parseInt(userId) === req.user.id) {
      return res.status(400).json({ message: '不能删除自己' });
    }

    const [docs] = await pool.execute('SELECT path FROM documents WHERE uploaderId = ?', [userId]);
    for (const doc of docs) {
      if (fs.existsSync(doc.path)) fs.unlinkSync(doc.path);
    }

    await pool.execute('DELETE FROM messages WHERE senderId = ?', [userId]);
    await pool.execute('DELETE FROM documents WHERE uploaderId = ?', [userId]);
    await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
    res.json({ message: '用户已删除' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 修改用户密码
app.post('/api/admin/users/:id/password', adminAuth, async (req, res) => {
  try {
    const { newPassword } = req.body;
    const userId = req.params.id;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ message: '密码长度至少为6个字符' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.execute('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);
    res.json({ message: '密码修改成功' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 文档列表（管理）
app.get('/api/admin/documents', adminAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM documents ORDER BY createdAt DESC');
    const usersMap = {};
    const docs = [];
    for (const doc of rows) {
      if (!usersMap[doc.uploaderId]) {
        const [u] = await pool.execute('SELECT * FROM users WHERE id = ?', [doc.uploaderId]);
        usersMap[doc.uploaderId] = u.length > 0 ? userToJson(u[0]) : null;
      }
      docs.push({ ...doc, _id: doc.id, uploader: usersMap[doc.uploaderId] });
    }
    res.json(docs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 删除文档（管理）
app.delete('/api/admin/documents/:id', adminAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: '文档不存在' });
    const doc = rows[0];
    if (fs.existsSync(doc.path)) fs.unlinkSync(doc.path);
    await pool.execute('DELETE FROM documents WHERE id = ?', [req.params.id]);
    res.json({ message: '文档已删除' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 文件夹列表
app.get('/api/admin/folders', adminAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM folders ORDER BY createdAt DESC');
    res.json(rows.map(f => ({ ...f, _id: f.id })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 创建文件夹
app.post('/api/admin/folders', adminAuth, async (req, res) => {
  try {
    const { name, parentId } = req.body;
    if (!name || name.trim().length === 0) return res.status(400).json({ message: '文件夹名称不能为空' });

    const now = Date.now();
    const [result] = await pool.execute(
      'INSERT INTO folders (name, parentId, createdAt) VALUES (?, ?, ?)',
      [name.trim(), parentId || null, now]
    );
    const [rows] = await pool.execute('SELECT * FROM folders WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: '文件夹创建成功', folder: { ...rows[0], _id: rows[0].id } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 删除文件夹（级联删除子文件夹及文件）
app.delete('/api/admin/folders/:id', adminAuth, async (req, res) => {
  try {
    const folderId = parseInt(req.params.id);
    if (isNaN(folderId)) {
      return res.status(400).json({ message: '无效的文件夹ID' });
    }

    // 递归收集所有子文件夹ID
    async function collectSubFolderIds(parentId) {
      const [rows] = await pool.execute('SELECT id FROM folders WHERE parentId = ?', [parentId]);
      let ids = [];
      for (const r of rows) {
        const childId = parseInt(r.id);
        ids.push(childId);
        const childIds = await collectSubFolderIds(childId);
        ids = ids.concat(childIds);
      }
      return ids;
    }

    const allIds = [folderId, ...(await collectSubFolderIds(folderId))];

    // 查询并物理删除所有文档（按 folderId 逐个处理）
    for (const id of allIds) {
      const [docs] = await pool.execute('SELECT path FROM documents WHERE folderId = ?', [id]);
      for (const doc of docs) {
        if (!doc.path) continue;
        try {
          const filePath = path.join(__dirname, doc.path.replace(/^\//, ''));
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (e) {
          console.error('删除文件失败:', doc.path, e.message);
        }
      }
      await pool.execute('DELETE FROM documents WHERE folderId = ?', [id]);
    }

    // 从叶子文件夹开始删除，避免外键或依赖问题
    for (let i = allIds.length - 1; i >= 0; i--) {
      await pool.execute('DELETE FROM folders WHERE id = ?', [allIds[i]]);
    }

    res.json({ message: '文件夹及文件已删除' });
  } catch (error) {
    console.error('删除文件夹失败:', error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 消息列表（管理）
app.get('/api/admin/messages', adminAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT m.*, u.username as sender_username, u.nickname as sender_nickname, u.avatar as sender_avatar ' +
      'FROM messages m JOIN users u ON m.senderId = u.id ORDER BY m.createdAt DESC LIMIT 200'
    );
    res.json(rows.map(m => ({
      _id: m.id,
      sender: { _id: m.senderId, username: m.sender_username, nickname: m.sender_nickname, avatar: m.sender_avatar },
      content: m.content,
      type: m.type,
      createdAt: m.createdAt
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 删除消息
app.delete('/api/admin/messages/:id', adminAuth, async (req, res) => {
  try {
    await pool.execute('DELETE FROM messages WHERE id = ?', [req.params.id]);
    res.json({ message: '消息已删除' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 首页重定向
app.get('/', (req, res) => res.redirect('/index.html'));

// ===== Socket.IO =====
const onlineUsers = new Map();

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('认证失败'));

    const decoded = jwt.verify(token, JWT_SECRET);
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [decoded.userId]);
    if (rows.length === 0) return next(new Error('用户不存在'));
    if (rows[0].banned) return next(new Error('账号已被封禁'));

    socket.userId = rows[0].id;
    socket.user = userToJson(rows[0]);
    next();
  } catch (error) {
    next(new Error('认证失败'));
  }
});

io.on('connection', async (socket) => {
  console.log(`用户连接: ${socket.user.username}`);

  await pool.execute('UPDATE users SET isOnline = 1, socketId = ?, lastSeen = ? WHERE id = ?',
    [socket.id, Date.now(), socket.userId]);

  onlineUsers.set(socket.userId, { socketId: socket.id, user: socket.user });

  io.emit('userOnline', {
    userId: socket.userId,
    username: socket.user.username,
    nickname: socket.user.nickname,
    gender: socket.user.gender,
    avatar: socket.user.avatar
  });

  const [allUsers] = await pool.execute('SELECT * FROM users ORDER BY isOnline DESC, lastSeen DESC');
  socket.emit('usersList', allUsers.map(u => userToJson(u)));

  const [messages] = await pool.execute(
    'SELECT m.*, u.username as sender_username, u.nickname as sender_nickname, u.gender as sender_gender, u.avatar as sender_avatar, u.role as sender_role ' +
    'FROM messages m JOIN users u ON m.senderId = u.id ORDER BY m.createdAt DESC LIMIT 50'
  );
  socket.emit('history', messages.reverse().map(m => ({
    _id: m.id,
    sender: {
      _id: m.senderId,
      username: m.sender_username,
      nickname: m.sender_nickname,
      gender: m.sender_gender || '',
      avatar: m.sender_avatar,
      role: m.sender_role || 'user'
    },
    content: m.content,
    type: m.type,
    createdAt: m.createdAt
  })));

  socket.on('chatMessage', async (data) => {
    try {
      const { content, type = 'text' } = data;
      if (!content || content.trim().length === 0) return;

      const now = Date.now();
      const [result] = await pool.execute(
        'INSERT INTO messages (senderId, content, type, createdAt) VALUES (?, ?, ?, ?)',
        [socket.userId, content.trim(), type, now]
      );

      const message = {
        _id: result.insertId,
        sender: {
          _id: socket.userId,
          username: socket.user.username,
          nickname: socket.user.nickname,
          gender: socket.user.gender,
          avatar: socket.user.avatar,
          role: socket.user.role
        },
        content: content.trim(),
        type,
        createdAt: now
      };

      io.emit('newMessage', message);
    } catch (error) {
      console.error('发送消息失败:', error);
    }
  });

  socket.on('typing', (data) => {
    socket.broadcast.emit('userTyping', {
      userId: socket.userId,
      username: socket.user.username,
      nickname: socket.user.nickname,
      gender: socket.user.gender,
      isTyping: data.isTyping
    });
  });

  socket.on('disconnect', async () => {
    console.log(`用户断开: ${socket.user.username}`);

    await pool.execute('UPDATE users SET isOnline = 0, socketId = NULL, lastSeen = ? WHERE id = ? AND socketId = ?',
      [Date.now(), socket.userId, socket.id]);

    onlineUsers.delete(socket.userId);
    io.emit('userOffline', {
      userId: socket.userId,
      username: socket.user.username,
      nickname: socket.user.nickname,
      gender: socket.user.gender
    });
  });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: '服务器内部错误' });
});

// 启动
async function start() {
  await initDb();
  server.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
    console.log(`访问 http://localhost:${PORT} 开始使用`);
    console.log(`后台管理: http://localhost:${PORT}/admin.html`);
    console.log('MySQL 数据库: it_community_chat');
  });
}

start();
