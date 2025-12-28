// routes/verifyRequest.js
const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const db = admin.firestore();

// Ánh xạ trạng thái sang tiếng Việt
const statusMap = {
    pending: "Chờ xử lý",
    approved: "Đã duyệt",
    rejected: "Bị từ chối"
};

// POST /verify-request/:userId
router.post('/:userId', async (req, res) => {
    const { userId } = req.params;
    const { username, fullName, bio } = req.body;

    try {
        const existing = await db.collection('verification_requests')
        .where('userId', '==', userId)
        .get(); // ← bỏ orderBy
    
    const activeRequest = existing.docs.find(doc => doc.data().status !== 'rejected');
    if (activeRequest) {
        return res.status(400).json({ message: 'Bạn đã gửi yêu cầu trước đó' });
    }
    
    await db.collection('verification_requests').add({
        userId,
        username,
        fullName,
        bio,
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'pending',
        isVerified: false,
    });
    

        res.status(200).json({ message: 'Đã gửi yêu cầu xác thực' });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi khi gửi yêu cầu', error: err.message });
    }
});

// GET /verify-request → admin lấy toàn bộ yêu cầu
router.get('/', async (req, res) => {
    try {
        const snapshot = await db.collection('verification_requests').orderBy('requestedAt', 'desc').get();

        const data = snapshot.docs.map(doc => {
            const raw = doc.data();
            return {
                id: doc.id,
                ...raw,
                requestedAt: raw.requestedAt?.toDate().toISOString() || null,
                status: statusMap[raw.status] || raw.status
            };
        });

        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ message: 'Lỗi khi lấy danh sách xác thực', error: err.message });
    }
});

// GET /verify-request/:userId → client kiểm tra trạng thái xác minh
router.get('/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const snapshot = await db.collection('verification_requests')
            .where('userId', '==', userId)
            .limit(1)
            .get();

        if (snapshot.empty) {
            return res.status(404).json({ message: 'Chưa gửi yêu cầu xác thực' });
        }

        const doc = snapshot.docs[0];
        const data = doc.data();

        res.status(200).json({
            status: statusMap[data.status] || data.status,
            requestedAt: data.requestedAt,
            isVerified: data.isVerified // Thêm dòng này
        });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi khi kiểm tra xác thực', error: err.message });
    }
});

// PUT /verify-request/:requestId → admin duyệt/từ chối
router.put('/:requestId', async (req, res) => {
    const { requestId } = req.params;
    const { status } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
    }

    try {
        const requestRef = db.collection('verification_requests').doc(requestId);
        const requestDoc = await requestRef.get();

        if (!requestDoc.exists) {
            return res.status(404).json({ message: 'Không tìm thấy yêu cầu' });
        }

        // Cập nhật trạng thái + isVerified cùng lúc
        await requestRef.update({
            status,
            isVerified: status === 'approved'
        });

        res.status(200).json({ message: `Đã cập nhật trạng thái: ${statusMap[status]}` });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi khi duyệt yêu cầu', error: err.message });
    }
});

// routes/verify-request.js
router.get('/status/:userId', async (req, res) => {
    const { userId } = req.params;
  
    try {
      const snapshot = await db.collection('verification_requests')
        .where('userId', '==', userId)
        .limit(1)
        .get();
  
      if (snapshot.empty) {
        return res.status(404).json({ message: 'Chưa gửi yêu cầu xác thực' });
      }
  
      const doc = snapshot.docs[0];
      const data = doc.data();
  
      res.status(200).json({
        status: data.status,
        requestedAt: data.requestedAt,
        isVerified: data.isVerified
      });
    } catch (err) {
      res.status(500).json({ message: 'Lỗi khi kiểm tra xác thực', error: err.message });
    }
  });
  


module.exports = router;
