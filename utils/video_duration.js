const ffmpeg = require("fluent-ffmpeg");
const ffprobe = require("ffprobe-static");
const fs = require("fs");
const os = require("os");
const path = require("path");

ffmpeg.setFfprobePath(ffprobe.path);

async function getVideoDurationSecondsFromBuffer(buffer) {
    const tmpPath = path.join(os.tmpdir(), `upload_${Date.now()}.mp4`);
    await fs.promises.writeFile(tmpPath, buffer);

    try {
        const duration = await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(tmpPath, (err, metadata) => {
                if (err) return reject(err);
                const d = metadata?.format?.duration;
                resolve(typeof d === "number" ? d : 0);
            });
        });
        return duration;
    } finally {
        fs.promises.unlink(tmpPath).catch(() => { });
    }
}

module.exports = { getVideoDurationSecondsFromBuffer };
