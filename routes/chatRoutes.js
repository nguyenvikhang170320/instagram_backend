const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { db } = require('../firebase');
const verifyToken = require('../middlewares/token');

// POST /api/chats - Tạo hoặc lấy chat 1-1 (Dùng Token)
router.post('/', verifyToken, async (req, res) => {
  // senderId lấy từ Token, receiverId lấy từ body
  const senderId = req.user.uid;
  const { receiverId } = req.body;

  if (!receiverId) return res.status(400).json({ message: 'Thiếu receiverId' });
  if (senderId === receiverId) return res.status(400).json({ message: 'Không thể chat với chính mình' });

  try {
    // Tạo chatId duy nhất dựa trên 2 ID người dùng (sắp xếp để ID1_ID2 luôn giống nhau)
    const participants = [senderId, receiverId].sort();
    const chatId = participants.join('_');

    const chatRef = db.collection('chats').doc(chatId);
    const chatDoc = await chatRef.get();

    if (chatDoc.exists) {
      return res.status(200).json({ chatId: chatDoc.id, ...chatDoc.data() });
    }

    // Nếu chưa có chat -> tạo mới
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    const newChat = {
      chatId: chatId,
      members: participants,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastMessage: '',
    };

    await chatRef.set(newChat);
    res.status(201).json(newChat);

  } catch (err) {
    res.status(500).json({ message: 'Lỗi tạo/lấy chat', error: err.message });
  }
});

// GET /api/chats - Lấy danh sách cuộc trò chuyện của tôi (Dùng Token)
router.get('/', verifyToken, async (req, res) => {
  const userId = req.user.uid; // Lấy UID từ token, không cần truyền trên URL

  try {
    const snapshot = await db.collection('chats')
      .where('members', 'array-contains', userId)
      .orderBy('updatedAt', 'desc')
      .get();

    const chats = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();
      // Tìm ID của người kia
      const otherUserId = data.members.find(id => id !== userId);

      // Lấy thông tin người kia để Flutter hiển thị avatar/tên
      const userSnap = await db.collection('users').doc(otherUserId).get();
      const userData = userSnap.exists ? userSnap.data() : {};

      chats.push({
        chatId: doc.id,
        lastMessage: data.lastMessage || '',
        updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : null,
        otherUser: {
          userId: otherUserId,
          username: userData.username || 'Người dùng',
          avatar: userData.avatar || ''
        }
      });
    }

    res.status(200).json(chats);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi lấy danh sách chat', error: err.message });
  }
});

module.exports = router;