(() => {
  "use strict";

  const sampleKey = ({ roundId, code, rater }) => JSON.stringify([roundId, code, rater]);

  function openStore(mode, action) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("little-taster.recordings", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("clips", { keyPath: "id" }).createIndex("sample", "sample");
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(Error("本机录音存储暂时被占用。"));
      request.onsuccess = () => {
        const db = request.result;
        try {
          const transaction = db.transaction("clips", mode);
          const operation = action(transaction.objectStore("clips"));
          transaction.oncomplete = () => { db.close(); resolve(operation.result); };
          transaction.onabort = () => { db.close(); reject(transaction.error); };
        } catch (error) {
          db.close();
          reject(error);
        }
      };
    });
  }

  function save(sample, blob) {
    if (!blob?.size) throw Error("本次没有录到可保存的声音。");
    const clip = { id: crypto.randomUUID(), sample: sampleKey(sample), at: Date.now(), blob };
    return openStore("readwrite", store => store.add(clip));
  }

  async function list(sample) {
    const clips = await openStore("readonly", store => store.index("sample").getAll(sampleKey(sample)));
    return clips.sort((a,b) => a.at - b.at);
  }

  async function record() {
    if (!globalThis.MediaRecorder || !navigator.mediaDevices?.getUserMedia) throw Error("浏览器无法保存录音。");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const release = () => stream.getTracks().forEach(track => track.stop());
    let recorder;
    try {
      recorder = new MediaRecorder(stream);
      recorder.start();
    } catch (error) {
      release();
      throw error;
    }
    const chunks = [];
    const complete = new Promise(resolve => {
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        release();
        resolve(new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type }));
      };
      recorder.onerror = () => { release(); resolve(null); };
    });
    let stopping;
    return {
      track: stream.getAudioTracks()[0],
      finish() {
        if (!stopping) {
          stopping = new Promise(resolve => {
            const timeout = setTimeout(() => { release(); resolve(null); }, 2000);
            complete.then(blob => { clearTimeout(timeout); resolve(blob); });
            try {
              if (recorder.state !== "inactive") recorder.stop();
            } catch {
              clearTimeout(timeout);
              release();
              resolve(null);
            }
          });
        }
        return stopping;
      }
    };
  }

  globalThis.TasterAudio = { record, save, list };
})();
