const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 20
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  nickname: {
    type: String,
    trim: true,
    maxlength: 30,
    default: ''
  },
  avatar: {
    type: String,
    default: '/uploads/avatars/default-avatar.png'
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  gender: {
    type: String,
    enum: ['', 'male', 'female'],
    default: ''
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  socketId: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('User', userSchema);
