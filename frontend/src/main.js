import './style.css';

document.querySelector('#app').innerHTML = `
  <button id="themeToggle" class="theme-toggle" type="button" title="Toggle dark mode">🌙</button>
  <main class="page">
    <section class="upload-card">
      <h1>AiVttApp</h1>
      <p class="subtitle">Upload voice file for transcription</p>

      <form id="uploadForm" class="upload-form">
        <label for="audioFile" id="dropZone" class="upload-bar" title="Choose audio file">
          <span id="fileLabel">Drop or choose voice file (.ogg, .opus, .mp3, .wav, .m4a, .webm, .flac, .aac, .amr)</span>
          <span id="progressCircle" class="progress-circle" aria-hidden="true">
            <svg viewBox="0 0 36 36" class="circle-svg">
              <path class="circle-bg" d="M18 2 a 16 16 0 0 1 0 32 a 16 16 0 0 1 0 -32" />
              <path id="circleBar" class="circle-bar" d="M18 2 a 16 16 0 0 1 0 32 a 16 16 0 0 1 0 -32" />
            </svg>
            <span id="circlePct" class="circle-pct">0%</span>
          </span>
          <!-- Broad accept list for common phone/chat voice formats across Telegram/WhatsApp/Viber/etc. -->
          <input id="audioFile" name="file" type="file" accept="audio/*,.ogg,.opus,.mp3,.wav,.m4a,.webm,.flac,.aac,.amr,.3gp,.mp4" required />
        </label>

        <div class="upload-actions">
          <small id="progressText" class="progress-text"></small>
          <button id="cancelBtn" class="cancel-btn" type="button">Cancel</button>
        </div>

        <div class="controls">
          <select name="language" id="language">
            <option value="auto">auto</option>
            <option value="sr">sr</option>
            <option value="en">en</option>
            <option value="es">es</option>
          </select>
          <select name="model" id="model">
            <option value="tiny">tiny</option>
            <option value="small" selected>small</option>
            <option value="medium">medium</option>
          </select>
          <button type="submit">Transcribe</button>
        </div>
      </form>

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
const CIRCLE_LEN = 100.53; // approx path length for the chosen arc
let lastTranscript = '';
let currentXhr = null;

const savedTheme = localStorage.getItem('aivtt-theme') || 'light';
document.body.classList.toggle('dark', savedTheme === 'dark');
themeToggle.textContent = savedTheme === 'dark' ? '☀️' : '🌙';

themeToggle.addEventListener('click', () => {
  const isDark = document.body.classList.toggle('dark');
  themeToggle.textContent = isDark ? '☀️' : '🌙';
  localStorage.setItem('aivtt-theme', isDark ? 'dark' : 'light');
});

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

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = fileInput.files?.[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('language', document.getElementById('language').value);
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
    output.textContent = JSON.stringify(res.data, null, 2);
  } catch (err) {
    output.textContent = `Request failed: ${err.message}`;
  }
});
