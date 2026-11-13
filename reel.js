// ================= reel.js: make a 9:16 video (1080 x 1920) of a square canvas =================
// One lap, plus one second to admire the result. Used by every mode.
//
// Two ways to make the video:
// 1. Frame by frame (preferred): we draw each frame ourselves and hand it to the browser's
//    video encoder (WebCodecs) with an exact time stamp. Every frame is perfect, however slow
//    or fast the device is, and the result is always an MP4 with H.264 video (what Instagram wants).
//    lib/mp4-muxer.js packs the encoded frames into an .mp4 file.
// 2. Live recording (fallback for browsers without WebCodecs): we film the canvas while it plays.

function makeReel(source) {
  const FPS = 30;
  const reel = document.createElement("canvas");   // the 9:16 canvas only the video sees
  reel.width = 1080;
  reel.height = 1920;
  const reelCtx = reel.getContext("2d");
  let busy = false;

  // Copy the square picture into the middle of the 9:16 frame and add the title
  function drawReelFrame(title) {
    reelCtx.fillStyle = "#000";
    reelCtx.fillRect(0, 0, 1080, 1920);
    reelCtx.drawImage(source, 0, 420, 1080, 1080);
    reelCtx.fillStyle = "#fff";
    reelCtx.font = "bold 64px system-ui, sans-serif";
    reelCtx.textAlign = "center";
    reelCtx.fillText(title, 540, 340);
  }

  function saveFile(blob, name) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
  }

  const pause = () => new Promise(resolve => setTimeout(resolve, 0));   // let the page breathe

  // ---------- way 1: frame by frame ----------
  async function pickH264() {
    if (!window.VideoEncoder || !window.VideoFrame || !window.Mp4Muxer) return null;
    // High, Main, then Baseline profile; all at level 4.0, enough for 1080 x 1920
    for (const codec of ["avc1.640028", "avc1.4d0028", "avc1.420028"]) {
      // format "avc" asks the encoder to also describe its settings, which the .mp4 file needs
      const config = { codec: codec, width: 1080, height: 1920, bitrate: 8000000, framerate: FPS,
                       avc: { format: "avc" } };
      try {
        const answer = await VideoEncoder.isConfigSupported(config);
        if (answer.supported) return config;
      } catch (e) { /* try the next one */ }
    }
    return null;
  }

  async function frameByFrame(config, job) {
    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: { codec: "avc", width: 1080, height: 1920 },
      fastStart: "in-memory",
    });
    let failure = null;
    let described = false;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        // The first piece of video must come with a description of the settings.
        // Some browsers (e.g. Firefox) leave it out; then we can't build an .mp4 this way.
        if (!described) {
          if (!meta || !meta.decoderConfig) {
            failure = failure || new Error("this browser's video encoder gave no settings description");
            return;
          }
          described = true;
        }
        muxer.addVideoChunk(chunk, meta);
      },
      error: e => { failure = e; },
    });
    encoder.configure(config);

    const lapFrames = Math.round(job.seconds * FPS);
    const total = lapFrames + FPS;                       // one lap, then hold for one second
    for (let i = 0; i < total; i++) {
      job.drawAt(Math.min(i / lapFrames, 1));
      drawReelFrame(job.title);
      const frame = new VideoFrame(reel, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
      encoder.encode(frame, { keyFrame: i % (2 * FPS) === 0 });
      frame.close();
      if (failure) { try { encoder.close(); } catch (e) {} throw failure; }
      while (encoder.encodeQueueSize > 6) await pause();   // don't run ahead of the encoder
      if (i % 5 === 0) {
        job.progress(i / total);
        await pause();
      }
    }
    await encoder.flush();
    if (failure) throw failure;
    muxer.finalize();
    saveFile(new Blob([muxer.target.buffer], { type: "video/mp4" }), job.filename + ".mp4");
  }

  // ---------- way 2: live recording ----------
  function liveRecording(job) {
    return new Promise((resolve, reject) => {
      const type = ["video/mp4;codecs=avc1", "video/mp4", "video/webm"].find(t => MediaRecorder.isTypeSupported(t));
      const manual = "CanvasCaptureMediaStreamTrack" in window &&
                     "requestFrame" in CanvasCaptureMediaStreamTrack.prototype;
      const stream = reel.captureStream(manual ? 0 : FPS);
      const track = stream.getVideoTracks()[0];
      const chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8000000 });
      recorder.ondataavailable = e => chunks.push(e.data);
      recorder.onerror = e => reject(e.error || new Error("recording failed"));
      recorder.onstop = () => {
        saveFile(new Blob(chunks, { type: type }),
                 job.filename + (type.startsWith("video/mp4") ? ".mp4" : ".webm"));
        resolve(type);
      };

      const lapFrames = Math.round(job.seconds * FPS);
      const total = lapFrames + FPS;
      let frame = 0, lastTime = 0;
      function loop(timeMs) {
        if (timeMs - lastTime >= 1000 / FPS - 2) {        // time for the next frame
          lastTime = timeMs;
          job.drawAt(Math.min(frame / lapFrames, 1));
          drawReelFrame(job.title);
          if (manual) track.requestFrame();
          frame++;
          job.progress(frame / total);
          if (frame >= total) { recorder.stop(); return; }
        }
        requestAnimationFrame(loop);
      }
      recorder.start();
      requestAnimationFrame(loop);
    });
  }

  // ---------- start ----------
  // job: { seconds, filename, title, drawAt(lapPos), progress(fraction), done(error, note) }
  async function start(job) {
    if (busy) return;
    busy = true;
    let error = null;
    let note = "Video saved to your downloads.";
    try {
      const config = await pickH264();
      let made = false;
      if (config) {
        try {
          await frameByFrame(config, job);
          made = true;
        } catch (e) {
          console.warn("Frame-by-frame video failed, recording live instead:", e);
        }
      }
      if (!made) {
        const type = await liveRecording(job);
        if (!type.startsWith("video/mp4")) {
          note = "Saved as a .webm video: this browser can't make MP4. For Instagram, " +
                 "record in Chrome or Safari, or convert the file to MP4.";
        }
      }
    } catch (e) {
      console.error(e);
      error = e;
    }
    busy = false;
    job.done(error, note);
  }

  return { start: start, isRecording: () => busy };
}