const express = require("express");
const { db } = require("../firebase"); // Import Firestore từ firebase.js

const router = express.Router();

router.get("/feed/:userId", async (req, res) => {
    console.log("✅ API được gọi với userId:", req.params.userId);
    try {
        const { userId } = req.params;

        // Lấy danh sách following
        const followingSnapshot = await db.collection("following").doc(userId).collection("following").get({ source: "server" }); // 🔥 Luôn lấy từ server, tránh cache
        let followingList = followingSnapshot.docs.map(doc => doc.id);

        console.log(`✅ User đang lấy feed: ${userId}`);
        console.log(`🔹 Danh sách following từ Firestore:`, followingList);

        // 🔥 Chuẩn hóa danh sách following để lấy userId chính xác
        const fixedFollowingList = await Promise.all(
            followingList.map(async (followedId) => {
                const userDoc = await db.collection("users").doc(followedId).get();
                if (userDoc.exists) {
                    console.log(`🎯 Chuẩn hóa ID: ${followedId} -> ${userDoc.id}`);
                    return userDoc.id; // Lấy ID chính xác từ Firestore
                }
                return null;
            })
        );

        const validFollowingList = fixedFollowingList.filter(id => id !== null);
        console.log(`🔹 Danh sách following (đã chuẩn hóa):`, validFollowingList);

        if (validFollowingList.length === 0) {
            return res.status(200).json({ posts: [] });
        }

        // Tìm bài đăng của những user đã chuẩn hóa ID
        let allPosts = [];

        await Promise.all(validFollowingList.map(async (followedUserId) => {
            console.log(`🔍 Đang tìm bài đăng của ${followedUserId}`);

            const userPostsSnapshot = await db.collection("posts")
                .where("userId", "==", followedUserId)  // Truy vấn đúng ID
                .orderBy("createdAt", "desc")
                .get();

            console.log(`✅ Tìm thấy ${userPostsSnapshot.size} bài đăng của ${followedUserId}`);

            userPostsSnapshot.forEach((doc) => {
                console.log(`📌 Bài đăng:`, doc.data());
                allPosts.push({ id: doc.id, ...doc.data() });
            });
        }));

        console.log(`🔥 Tổng số bài đăng tìm thấy: ${allPosts.length}`);
        res.status(200).json({ posts: allPosts });
    } catch (error) {
        console.error("❌ Lỗi khi lấy feed:", error);
        res.status(500).json({ message: "Lỗi khi lấy feed", error });
    }
});


module.exports = router;