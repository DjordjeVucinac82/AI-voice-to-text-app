import './style.css';

// Render the full UI shell (upload, recording controls, output panel).
document.querySelector('#app').innerHTML = `
  <button id="themeToggle" class="theme-toggle" type="button" title="Toggle dark mode">🌙</button>
  <main class="page">
    <section class="upload-card">
      <h1>AiVttApp</h1>
      <p class="subtitle">Upload voice file for transcription</p>

      <form id="uploadForm" class="upload-form">
        <label for="audioFile" id="dropZone" class="upload-bar" title="Choose audio file">
          <span id="fileLabel">Drop or choose voice file (.ogg, .opus, .mp3, .wav, .m4a, .webm, .flac, .aac, .amr)</span>
          <span class="upload-right-controls">
            <span id="progressCircle" class="progress-circle" aria-hidden="true">
              <svg viewBox="0 0 36 36" class="circle-svg">
                <path class="circle-bg" d="M18 2 a 16 16 0 0 1 0 32 a 16 16 0 0 1 0 -32" />
                <path id="circleBar" class="circle-bar" d="M18 2 a 16 16 0 0 1 0 32 a 16 16 0 0 1 0 -32" />
              </svg>
              <span id="circlePct" class="circle-pct">0%</span>
            </span>
            <button id="browseBtn" class="folder-icon" type="button" title="Choose file from local disk">📁</button>
          </span>
          <!-- Broad accept list for common phone/chat voice formats across Telegram/WhatsApp/Viber/etc. -->
          <input id="audioFile" name="file" type="file" accept="audio/*,.ogg,.opus,.mp3,.wav,.m4a,.webm,.flac,.aac,.amr,.3gp,.mp4" required />
        </label>

        <div class="upload-actions">
          <small id="progressText" class="progress-text"></small>
          <button id="cancelBtn" class="cancel-btn" type="button">Cancel</button>
        </div>

        <div class="controls">
          <select name="model" id="model">
            <option value="tiny">tiny</option>
            <option value="small" selected>small</option>
            <option value="medium">medium</option>
          </select>
          <button id="recordBtn" type="button">Start recording</button>
          <button type="submit">Transcribe</button>
        </div>

        <div class="controls translate-controls">
          <select id="translateLang" title="Translate transcript to">
            <option value="en">English</option>
            <option value="sr">Serbian</option>
            <option value="es">Spanish</option>
            <option value="de">German</option>
            <option value="fr">French</option>
            <option value="it">Italian</option>
            <option value="pt">Portuguese</option>
            <option value="ru">Russian</option>
            <option value="tr">Turkish</option>
            <option value="nl">Dutch</option>
            <option value="pl">Polish</option>
            <option value="ro">Romanian</option>
            <option value="hu">Hungarian</option>
            <option value="cs">Czech</option>
            <option value="sk">Slovak</option>
            <option value="sv">Swedish</option>
            <option value="no">Norwegian</option>
            <option value="da">Danish</option>
            <option value="fi">Finnish</option>
            <option value="el">Greek</option>
            <option value="uk">Ukrainian</option>
          </select>
          <button id="translateBtn" type="button">Translate</button>
        </div>
      </form>

      <div class="detected-lang" id="detectedLang">Detected language: -</div>
      <div class="controls translate-controls">
        <button id="showOriginalBtn" type="button">Original</button>
        <button id="showTranslatedBtn" type="button">Translated</button>
      </div>
      <div class="output-wrap">
        <pre id="output" class="output">No transcript yet.</pre>
        <button id="copyBtn" class="copy-btn" type="button" title="Copy transcript">Copy</button>
      </div>
    </section>
  </main>
`;

const themeToggle = document.getElementById('themeToggle');
const fileInput = document.getElementById('audioFile');
const fileLabel = document.getElementById('fileLabel');
const form = document.getElementById('uploadForm');
const output = document.getElementById('output');
const dropZone = document.getElementById('dropZone');
const circleBar = document.getElementById('circleBar');
const circlePct = document.getElementById('circlePct');
const progressText = document.getElementById('progressText');
const cancelBtn = document.getElementById('cancelBtn');
const copyBtn = document.getElementById('copyBtn');
const browseBtn = document.getElementById('browseBtn');
const recordBtn = document.getElementById('recordBtn');
const translateBtn = document.getElementById('translateBtn');
const translateLang = document.getElementById('translateLang');
const detectedLang = document.getElementById('detectedLang');
const showOriginalBtn = document.getElementById('showOriginalBtn');
const showTranslatedBtn = document.getElementById('showTranslatedBtn');
const CIRCLE_LEN = 100.53; // approx path length for the chosen arc
let lastTranscript = '';
let lastTranslatedText = '';
let currentXhr = null;
let mediaRecorder = null;
let mediaStream = null;
let recordingChunks = [];

// Theme bootstrap: restore persisted preference (light/dark) from localStorage.
const savedTheme = localStorage.getItem('aivtt-theme') || 'light';
document.body.classList.toggle('dark', savedTheme === 'dark');
themeToggle.textContent = savedTheme === 'dark' ? '☀️' : '🌙';

themeToggle.addEventListener('click', () => {
  const isDark = document.body.classList.toggle('dark');
  themeToggle.textContent = isDark ? '☀️' : '🌙';
  localStorage.setItem('aivtt-theme', isDark ? 'dark' : 'light');
});

// Programmatically set the file input (used for drag&drop and recorded blobs).
function setFile(file) {
  const dt = new DataTransfer();
  dt.items.add(file);
  fileInput.files = dt.files;
  fileLabel.textContent = file.name;
}

fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  fileLabel.textContent = f ? f.name : 'Drop or choose voice file (.ogg, .opus, .mp3, .wav, .m4a, .webm, .flac, .aac, .amr)';
});

['dragenter', 'dragover'].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
});

['dragleave', 'drop'].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
  });
});

dropZone.addEventListener('drop', (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (file && file.type.startsWith('audio/')) setFile(file);
});

// Explicit local file picker trigger via folder button.
browseBtn.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  fileInput.click();
});

// Upload helper with progress callbacks and abort support (XMLHttpRequest).
function uploadWithProgress(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    currentXhr = xhr;
    xhr.open('POST', url);

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        const pct = Math.round((evt.loaded / evt.total) * 100);
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText || '{}');
        resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
      } catch {
        reject(new Error('Invalid JSON response'));
      }
    };

    xhr.onerror = () => {
      currentXhr = null;
      reject(new Error('Network error'));
    };

    xhr.onabort = () => {
      currentXhr = null;
      reject(new Error('Upload canceled'));
    };

    xhr.onloadend = () => {
      currentXhr = null;
    };

    xhr.send(formData);
  });
}

cancelBtn.addEventListener('click', () => {
  if (currentXhr) {
    currentXhr.abort();
    progressText.textContent = 'Upload canceled';
  }
});

copyBtn.addEventListener('click', async () => {
  const text = (lastTranscript || output.textContent || '').trim();
  if (!text || text === 'No transcript yet.') return;
  try {
    await navigator.clipboard.writeText(text);
    const prev = copyBtn.textContent;
    copyBtn.textContent = 'Copied';
    setTimeout(() => (copyBtn.textContent = prev), 1000);
  } catch {
    copyBtn.textContent = 'Copy failed';
    setTimeout(() => (copyBtn.textContent = 'Copy'), 1200);
  }
});

// Translate the latest transcript to selected language via public translate API.
translateBtn.addEventListener('click', async () => {
  const sourceText = (lastTranscript || '').trim();
  if (!sourceText) {
    progressText.textContent = 'No transcript to translate yet.';
    return;
  }

  const target = translateLang.value;
  const prev = translateBtn.textContent;
  translateBtn.textContent = 'Translating...';
  translateBtn.disabled = true;

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(sourceText)}&langpair=auto|${encodeURIComponent(target)}`;
    const res = await fetch(url);
    const data = await res.json();

    const translated = data?.responseData?.translatedText?.trim();
    if (!translated) throw new Error('Translation response missing text');

    lastTranslatedText = translated;
    output.textContent = lastTranslatedText;
    progressText.textContent = `Translated to ${target}`;
  } catch (err) {
    progressText.textContent = `Translate failed: ${err.message}`;
  } finally {
    translateBtn.textContent = prev;
    translateBtn.disabled = false;
  }
});

// Recording flow:
// - first click: request microphone permission + start recording
// - second click: stop recording, create file blob, auto-submit for transcription
showOriginalBtn.addEventListener('click', () => {
  output.textContent = (lastTranscript || 'No transcript yet.').trim() || 'No transcript yet.';
});

showTranslatedBtn.addEventListener('click', () => {
  output.textContent = (lastTranslatedText || 'No translated transcript yet.').trim() || 'No translated transcript yet.';
});

recordBtn.addEventListener('click', async () => {
  const isRecording = mediaRecorder && mediaRecorder.state === 'recording';

  if (!isRecording) {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingChunks = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      mediaRecorder = new MediaRecorder(mediaStream, { mimeType });
      mediaRecorder.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) recordingChunks.push(evt.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordingChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        const file = new File([blob], `recording-${Date.now()}.webm`, { type: blob.type });
        setFile(file);
        progressText.textContent = 'Recording ready. Starting transcription...';

        // Auto-submit immediately after recording stops
        form.requestSubmit();

        if (mediaStream) {
          mediaStream.getTracks().forEach((t) => t.stop());
          mediaStream = null;
        }
      };

      mediaRecorder.start();
      recordBtn.textContent = 'Stop recording';
      recordBtn.classList.add('recording');
      progressText.textContent = 'Recording...';
    } catch (err) {
      progressText.textContent = `Microphone access error: ${err.message}`;
    }
  } else {
    mediaRecorder.stop();
    recordBtn.textContent = 'Start recording';
    recordBtn.classList.remove('recording');
  }
});

// Main transcription submit flow (file upload -> API call -> UI update).
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = fileInput.files?.[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);
  // Always auto-detect language (no manual language dropdown in UI)
  formData.append('language', 'auto');
  formData.append('model', document.getElementById('model').value);

  output.textContent = 'Processing...';
  circleBar.style.strokeDasharray = `${CIRCLE_LEN}`;
  circleBar.style.strokeDashoffset = `${CIRCLE_LEN}`;
  circlePct.textContent = '0%';
  progressText.textContent = 'Upload 0%';

  try {
    const res = await uploadWithProgress('/api/v1/transcribe', formData, (pct) => {
      const offset = CIRCLE_LEN * (1 - pct / 100);
      circleBar.style.strokeDashoffset = `${offset}`;
      circlePct.textContent = `${pct}%`;
      progressText.textContent = `Upload ${pct}%`;
    });

    if (!res.ok) {
      output.textContent = `Error: ${res.data.detail || 'unknown error'}`;
      return;
    }

    progressText.textContent = 'Upload complete';
    lastTranscript = (res.data.text || '').trim();
    lastTranslatedText = '';
    const lang = (res.data.language || 'unknown').toString();
    const conf = typeof res.data.language_probability === 'number'
      ? ` (${(res.data.language_probability * 100).toFixed(1)}%)`
      : '';
    detectedLang.textContent = `Detected language: ${lang}${conf}`;
    output.textContent = JSON.stringify(res.data, null, 2);
  } catch (err) {
    output.textContent = `Request failed: ${err.message}`;
  }
});
