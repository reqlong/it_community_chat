const express = require('express');
const multer = require('multer');
const path = require('path');
const User = require('../models/User');
const auth = require('../middleware/auth');
const router = express.Router();

// 配置头像上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/avatars/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('只允许上传图片文件'), false);
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// 修改昵称
router.patch('/nickname', auth, async (req, res) => {
  try {
    const { nickname } = req.body;

    if (!nickname || nickname.trim().length === 0) {
      return res.status(400).json({ message: '昵称不能为空' });
    }

    if (nickname.length > 30) {
      return res.status(400).json({ message: '昵称长度不能超过30个字符' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { nickname: nickname.trim() },
      { new: true }
    ).select('-password');

    res.json({
      message: '昵称修改成功',
      user: {
        id: user._id,
        username: user.username,
        nickname: user.nickname,
        avatar: user.avatar
      }
    });
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
});

// 更换头像
router.post('/avatar', auth, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '请选择要上传的头像' });
    }

    const avatarPath = '/uploads/avatars/' + req.file.filename;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { avatar: avatarPath },
      { new: true }
    ).select('-password');

    res.json({
      message: '头像更换成功',
      user: {
        id: user._id,
        username: user.username,
        nickname: user.nickname,
        avatar: user.avatar
      }
    });
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
});

// 获取所有用户（用于显示在线列表）
router.get('/list', auth, async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ isOnline: -1, lastSeen: -1 });

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
});

module.exports = router;
