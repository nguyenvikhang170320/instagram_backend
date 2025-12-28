const express = require("express");
const router = express.Router();
const verifyToken = require("../middlewares/token");
const { db } = require("../firebase");
const admin = require("firebase-admin");

// 1. GET /api/follow/:userId -> Lấy số lượng followers và following
router.get("/:userId", async (req, res) => {
    try {
        const userId = req.params.userId;

        // Lấy số lượng người theo dõi (followers)
        const followersRef = db.collection("followers").doc(userId).collection("followers");
        const followersSnapshot = await followersRef.get();
        const followersCount = followersSnapshot.size;

        // Lấy số lượng người mà userId đang theo dõi (following)
        const followingRef = db.collection("following").doc(userId).collection("following");
        const followingSnapshot = await followingRef.get();
        const followingCount = followingSnapshot.size;

        res.json({
            followersCount: followersCount,
            followingCount: followingCount
        });
    } catch (error) {
        res.status(500).json({ message: "Lỗi server", error: error.message });
    }
});

// 2. POST /api/follow/ -> Theo dõi người dùng
router.post("/", verifyToken, async (req, res) => {
    try {
        const followerId = req.user.uid; // Lấy từ Token
        const { followingId } = req.body;

        if (!followingId) {
            return res.status(400).json({ message: "Thiếu followingId" });
        }

        if (followerId === followingId) {
            return res.status(400).json({ message: "Không thể tự follow chính mình" });
        }

        const batch = db.batch();
        const followingDocRef = db.collection("following").doc(followerId).collection("following").doc(followingId);
        const followerDocRef = db.collection("followers").doc(followingId).collection("followers").doc(followerId);

        const followCheck = await followingDocRef.get();
        if (followCheck.exists) {
            return res.status(400).json({ message: "Bạn đã follow người này rồi!" });
        }

        // Lưu đồng thời vào 2 bảng bằng Batch
        batch.set(followingDocRef, {
            userId: followingId,
            followedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        batch.set(followerDocRef, {
            userId: followerId,
            followedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();
        res.status(200).json({ success: true, message: "Follow thành công!" });

    } catch (error) {
        res.status(500).json({ message: "Lỗi khi follow", error: error.message });
    }
});

// 3. DELETE /api/follow/ -> Bỏ theo dõi
router.delete("/", verifyToken, async (req, res) => {
    try {
        const followerId = req.user.uid; // Lấy từ Token
        const { followingId } = req.body;

        if (!followingId) {
            return res.status(400).json({ message: "Thiếu followingId" });
        }

        const batch = db.batch();
        const followingDocRef = db.collection("following").doc(followerId).collection("following").doc(followingId);
        const followerDocRef = db.collection("followers").doc(followingId).collection("followers").doc(followerId);

        batch.delete(followingDocRef);
        batch.delete(followerDocRef);

        await batch.commit();
        res.status(200).json({ success: true, message: "Unfollow thành công!" });
    } catch (error) {
        res.status(500).json({ message: "Lỗi khi unfollow", error: error.message });
    }
});

// 4. GET /api/follow/check-following/:userId -> Kiểm tra danh sách ID đang follow
router.get("/check-following/:userId", async (req, res) => {
    try {
        const { userId } = req.params;
        const followingRef = db.collection("following").doc(userId).collection("following");
        const snapshot = await followingRef.get();

        let followingList = snapshot.docs.map(doc => doc.id);
        res.status(200).json({ followingList });
    } catch (error) {
        res.status(500).json({ message: "Lỗi server", error: error.message });
    }
});

// 5. GET /api/follow/following/:userId -> Lấy danh sách đang theo dõi kèm info
router.get("/following/:userId", async (req, res) => {
    try {
        const userId = req.params.userId;
        const snapshot = await db.collection("following").doc(userId).collection("following").get();

        let following = [];
        let userCache = {};

        for (const doc of snapshot.docs) {
            const uId = doc.id;
            if (!userCache[uId]) {
                const userDoc = await db.collection("users").doc(uId).get();
                userCache[uId] = userDoc.exists ? userDoc.data() : null;
            }

            if (userCache[uId]) {
                following.push({
                    userId: uId,
                    username: userCache[uId].username,
                    fullname: userCache[uId].fullname || "",
                    avatar: userCache[uId].avatar || "",
                });
            }
        }
        res.status(200).json(following);
    } catch (error) {
        res.status(500).json({ error: "Lỗi server" });
    }
});

// 6. GET /api/follow/followers/:userId -> Lấy danh sách người theo dõi kèm info
router.get("/followers/:userId", async (req, res) => {
    try {
        const userId = req.params.userId;
        const snapshot = await db.collection("followers").doc(userId).collection("followers").get();

        let followers = [];
        let userCache = {};

        for (const doc of snapshot.docs) {
            const uId = doc.id;
            if (!userCache[uId]) {
                const userDoc = await db.collection("users").doc(uId).get();
                userCache[uId] = userDoc.exists ? userDoc.data() : null;
            }

            if (userCache[uId]) {
                followers.push({
                    userId: uId,
                    username: userCache[uId].username,
                    fullname: userCache[uId].fullname || "",
                    avatar: userCache[uId].avatar || "",
                });
            }
        }
        res.status(200).json(followers);
    } catch (error) {
        res.status(500).json({ error: "Lỗi server" });
    }
});

module.exports = router;