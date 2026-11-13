// ================= reel.js: record a 9:16 video of a square canvas =================
// One lap, plus one second to admire the result. Used by both modes.
function makeReel(source) {
  const FPS = 30;                                  // video frames per second
  const reel = document.createElement("canvas");   // the 9:16 canvas only the recorder sees
  reel.width = 1080;
  reel.height = 1920;
  const reelCtx = reel.getContext("2d");

  let recorder = null;      // null means "not recording"
  let track = null;         // the video track we feed frames into
  let frame = 0;            // how many frames recorded so far
  let lastTime = 0;         // when the last frame was taken
  let lapSeconds = 8;
  let title = "";
  let onDone = null;

  // Copy the square picture into the middle of the 9:16 frame and add the title
  function drawReelFrame() {
    reelCtx.fillStyle = "#000";
    reelCtx.fillRect(0, 0, 1080, 1920);
    reelCtx.drawImage(source, 0, 420, 1080, 1080);
    reelCtx.fillStyle = "#fff";
    reelCtx.font = "bold 64px system-ui, sans-serif";
    reelCtx.textAlign = "center";
    reelCtx.fillText(title, 540, 340);
  }

  // Start recording. When done, the video is offered as filename.mp4 and done() is called.
  function start(seconds, filename, reelTitle, done) {
    if (recorder) return;
    lapSeconds = seconds;
    title = reelTitle;
    onDone = done;

    // Prefer MP4 with H.264 video (what Instagram wants), then any MP4, then WebM
    const type = ["video/mp4;codecs=avc1", "video/mp4", "video/webm"]
      .find(t => MediaRecorder.isTypeSupported(t));
    const stream = reel.captureStream(0);          // 0 = only take a picture when we ask
    track = stream.getVideoTracks()[0];
    const chunks = [];

    recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8000000 });
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = () => {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob(chunks, { type: type }));
      link.download = filename + (type.startsWith("video/mp4") ? ".mp4" : ".webm");
      link.click();
      recorder = null;
      if (onDone) onDone();
    };
    frame = 0;
    lastTime = 0;
    recorder.start();
  }

  // Call from the animation loop while recording.
  // drawAt(lapPos) must draw the source canvas at that moment of the lap (0 to 1).
  function step(timeMs, drawAt) {
    if (!recorder || recorder.state !== "recording") return;
    if (timeMs - lastTime < 1000 / FPS - 2) return;     // not time for the next frame yet
    lastTime = timeMs;

    const lapFrames = lapSeconds * FPS;
    drawAt(Math.min(frame / lapFrames, 1));             // same step every frame; hold at the end
    drawReelFrame();
    track.requestFrame();                               // put exactly this picture in the video
    frame++;

    if (frame > lapFrames + FPS) recorder.stop();       // one lap plus one second, then stop
  }

  return { start: start, step: step, isRecording: () => recorder !== null };
}