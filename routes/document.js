const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Document = require('../models/Document');
const auth = require('../middleware/auth');
const router = express.Router();

// 确保上传目录存在
const uploadsDir = path.join(__dirname, '..', 'uploads', 'documents');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// 配置文档上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// 上传文档
router.post('/upload', auth, upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '请选择要上传的文档' });
    }

    const { description = '' } = req.body;

    const doc = new Document({
      originalName: req.file.originalname,
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploader: req.user._id,
      description
    });

    await doc.save();
    await doc.populate('uploader', 'username nickname avatar');

    res.status(201).json({
      message: '文档上传成功',
      document: doc
    });
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
});

// 获取文档列表
router.get('/list', auth, async (req, res) => {
  try {
    const documents = await Document.find()
      .populate('uploader', 'username nickname avatar')
      .sort({ createdAt: -1 });

    res.json(documents);
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
});

// 下载文档
router.get('/download/:id', auth, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);

    if (!doc) {
      return res.status(404).json({ message: '文档不存在' });
    }

    if (!fs.existsSync(doc.path)) {
      return res.status(404).json({ message: '文件不存在' });
    }

    // 增加下载计数
    doc.downloadCount += 1;
    await doc.save();

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.originalName)}"`);
    res.setHeader('Content-Type', doc.mimetype);

    const fileStream = fs.createReadStream(doc.path);
    fileStream.pipe(res);
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
});

// 删除文档（仅限上传者）
router.delete('/:id', auth, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);

    if (!doc) {
      return res.status(404).json({ message: '文档不存在' });
    }

    if (doc.uploader.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: '无权删除此文档' });
    }

    // 删除文件
    if (fs.existsSync(doc.path)) {
      fs.unlinkSync(doc.path);
    }

    await Document.findByIdAndDelete(req.params.id);

    res.json({ message: '文档删除成功' });
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
});

module.exports = router;
