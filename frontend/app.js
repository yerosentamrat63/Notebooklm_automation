(function() {
  'use strict';

  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const fileList = document.getElementById('file-list');
  const configPanel = document.getElementById('config-panel');
  const notebookName = document.getElementById('notebook-name');
  const genMindmap = document.getElementById('gen-mindmap');
  const genQuiz = document.getElementById('gen-quiz');
  const genFlashcards = document.getElementById('gen-flashcards');
  const quizOptions = document.getElementById('quiz-options');
  const flashcardOptions = document.getElementById('flashcard-options');
  const submitBtn = document.getElementById('submit-btn');
  const progressPanel = document.getElementById('progress-panel');
  const progressStatus = document.getElementById('progress-status');
  const progressDetail = document.getElementById('progress-detail');
  const progressSteps = document.getElementById('progress-steps');
  const resultPanel = document.getElementById('result-panel');
  const resultText = document.getElementById('result-text');
  const notebookLink = document.getElementById('notebook-link');
  const newBtn = document.getElementById('new-btn');
  const authBanner = document.getElementById('auth-banner');

  let selectedFiles = [];
  const pillValues = {
    'quiz-questions': '25',
    'quiz-difficulty': 'Medium',
    'fc-questions': '25',
    'fc-difficulty': 'Medium',
  };

  const SUPPORTED = ['.pdf', '.docx', '.pptx'];

  function formatTime(secs) {
    const d = Math.floor(secs / 86400);
    const h = Math.floor((secs % 86400) / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (d > 0) return d + 'd ' + h + 'h';
    if (h > 0) return h + 'h ' + m + 'm';
    return m + 'm';
  }

  async function checkAuth() {
    try {
      const res = await fetch('/auth-status');
      const data = await res.json();
      if (!data.authenticated) {
        authBanner.textContent = data.error === 'Cookies expired' ? 'Session expired. Re-export cookies from your browser.' : data.error;
        authBanner.classList.remove('hidden');
        authBanner.className = 'auth-banner auth-error';
      } else if (data.expires_in && data.expires_in < 604800) {
        authBanner.textContent = 'Session expires in ' + formatTime(data.expires_in);
        authBanner.classList.remove('hidden');
        authBanner.className = 'auth-banner auth-warn';
      } else {
        authBanner.classList.add('hidden');
      }
    } catch(e) {}
  }
  checkAuth();
  setInterval(checkAuth, 60000);

  document.addEventListener('click', (e) => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    const group = pill.dataset.group;
    pill.parentElement.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    pillValues[group] = pill.dataset.value;
  });

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'pdf') return '📄';
    if (ext === 'docx' || ext === 'doc') return '📝';
    if (ext === 'pptx' || ext === 'ppt') return '📊';
    return '📁';
  }

  function getExtension(name) {
    return '.' + name.split('.').pop().toLowerCase();
  }

  function showToast(msg) {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#c62828;color:#fff;padding:12px 20px;border-radius:8px;font-size:14px;z-index:9999;max-width:90%;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,0.4);';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 3500);
  }

  function removeFile(index) {
    selectedFiles.splice(index, 1);
    updateFileList();
  }

  function updateFileList() {
    fileList.innerHTML = '';
    if (selectedFiles.length === 0) {
      fileList.classList.add('hidden');
      configPanel.classList.add('hidden');
      return;
    }
    fileList.classList.remove('hidden');
    const ul = document.createElement('div');
    selectedFiles.forEach((f, i) => {
      const item = document.createElement('div');
      item.className = 'file-item';
      item.innerHTML = `
        <span class="file-icon">${getFileIcon(f.name)}</span>
        <span class="file-name">${f.name}</span>
        <span class="file-size">${formatSize(f.size)}</span>
        <button class="file-remove" data-index="${i}" title="Remove">&times;</button>
      `;
      ul.appendChild(item);
    });
    fileList.appendChild(ul);
    fileList.querySelectorAll('.file-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeFile(parseInt(btn.dataset.index));
      });
    });
    configPanel.classList.remove('hidden');
    if (!notebookName.value) {
      notebookName.value = 'Study Notebook ' + new Date().toLocaleDateString();
    }
    updateSubmitBtn();
  }

  function updateSubmitBtn() {
    submitBtn.disabled = selectedFiles.length === 0 || !notebookName.value.trim();
  }

  function handleFiles(files) {
    const valid = [];
    const rejected = [];
    for (const f of files) {
      const ext = getExtension(f.name);
      if (SUPPORTED.includes(ext)) {
        if (!selectedFiles.find(sf => sf.name === f.name && sf.size === f.size)) {
          valid.push(f);
        }
      } else {
        rejected.push(f.name);
      }
    }
    if (rejected.length > 0) {
      showToast('Unsupported: ' + rejected.join(', ') + ' (use PDF, DOCX, or PPTX)');
    }
    if (valid.length === 0) return;
    selectedFiles = selectedFiles.concat(valid);
    updateFileList();
  }

  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener('change', () => {
    handleFiles(fileInput.files);
    fileInput.value = '';
  });

  genQuiz.addEventListener('change', () => {
    quizOptions.classList.toggle('hidden', !genQuiz.checked);
  });

  genFlashcards.addEventListener('change', () => {
    flashcardOptions.classList.toggle('hidden', !genFlashcards.checked);
  });

  notebookName.addEventListener('input', updateSubmitBtn);

  function buildProgressSteps() {
    const steps = [
      { id: 'notebook', text: 'Creating notebook', icon: '⬜' },
      { id: 'sources', text: 'Uploading sources', icon: '⬜' },
    ];
    if (genMindmap.checked) steps.push({ id: 'mind_map', text: 'Generating mind map', icon: '⬜' });
    if (genQuiz.checked) steps.push({ id: 'quiz', text: 'Generating quiz', icon: '⬜' });
    if (genFlashcards.checked) steps.push({ id: 'flashcards', text: 'Generating flashcards', icon: '⬜' });
    steps.push({ id: 'done', text: 'Done!', icon: '⬜' });
    return steps;
  }

  function renderSteps(steps) {
    progressSteps.innerHTML = '';
    steps.forEach(s => {
      const div = document.createElement('div');
      div.className = 'progress-step' + (s.status ? ' ' + s.status : '');
      div.innerHTML = `<span class="step-icon">${s.icon}</span><span>${s.text}</span>`;
      progressSteps.appendChild(div);
    });
  }

  function setStep(steps, stepId, status) {
    const step = steps.find(s => s.id === stepId);
    if (!step) return;
    step.status = status;
    step.icon = status === 'done' ? '✅' : status === 'active' ? '⏳' : status === 'error' ? '❌' : '⬜';
    renderSteps(steps);
  }

  function buildQuizInstructions() {
    const q = pillValues['quiz-questions'];
    const d = pillValues['quiz-difficulty'];
    return 'Create a quiz with ' + q + ' questions at ' + d + ' difficulty level.';
  }

  function buildFlashcardInstructions() {
    const q = pillValues['fc-questions'];
    const d = pillValues['fc-difficulty'];
    return 'Create ' + q + ' flashcards at ' + d + ' difficulty level.';
  }

  submitBtn.addEventListener('click', async () => {
    if (selectedFiles.length === 0) return;

    const name = notebookName.value.trim() || 'Study Notebook';

    const steps = buildProgressSteps();
    progressPanel.classList.remove('hidden');
    configPanel.classList.add('hidden');
    resultPanel.classList.add('hidden');
    progressStatus.textContent = 'Starting...';
    progressDetail.textContent = '';
    renderSteps(steps);

    const formData = new FormData();
    for (const f of selectedFiles) {
      formData.append('files', f);
    }
    formData.append('notebook_name', name);
    formData.append('generate_mindmap', genMindmap.checked ? 'true' : 'false');
    formData.append('generate_quiz', genQuiz.checked ? 'true' : 'false');
    formData.append('quiz_difficulty', pillValues['quiz-difficulty'].toLowerCase());
    formData.append('quiz_quantity', 'standard');
    formData.append('quiz_instructions', genQuiz.checked ? buildQuizInstructions() : '');
    formData.append('generate_flashcards', genFlashcards.checked ? 'true' : 'false');
    formData.append('flashcards_difficulty', pillValues['fc-difficulty'].toLowerCase());
    formData.append('flashcards_quantity', 'standard');
    formData.append('flashcards_instructions', genFlashcards.checked ? buildFlashcardInstructions() : '');

    try {
      const res = await fetch('/upload', { method: 'POST', body: formData });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Upload failed');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);

          if (event.step === 'notebook' && event.status === 'done') {
            setStep(steps, 'notebook', 'done');
            setStep(steps, 'sources', 'active');
            progressStatus.textContent = 'Uploading sources...';
          } else if (event.step === 'sources' && event.status === 'done') {
            setStep(steps, 'sources', 'done');
            progressStatus.textContent = 'Generating content...';
            progressDetail.textContent = 'This may take a minute';
          } else if (event.step === 'mind_map' && event.status === 'active') {
            setStep(steps, 'mind_map', 'active');
          } else if (event.step === 'mind_map' && event.status === 'done') {
            setStep(steps, 'mind_map', 'done');
          } else if (event.step === 'quiz' && event.status === 'active') {
            setStep(steps, 'quiz', 'active');
          } else if (event.step === 'quiz' && event.status === 'done') {
            setStep(steps, 'quiz', 'done');
          } else if (event.step === 'flashcards' && event.status === 'active') {
            setStep(steps, 'flashcards', 'active');
          } else if (event.step === 'flashcards' && event.status === 'done') {
            setStep(steps, 'flashcards', 'done');
          } else if (event.step === 'done') {
            setStep(steps, 'done', 'done');
            progressPanel.classList.add('hidden');
            resultPanel.classList.remove('hidden');
            const r = event.result;
            const generated = [];
            if (r.generated.mind_map) generated.push('Mind Map');
            if (r.generated.quiz) generated.push('Quiz');
            if (r.generated.flashcards) generated.push('Flashcards');
            resultText.textContent = '"' + r.notebook_name + '" created with ' + generated.join(', ') + '. Open it in NotebookLM to view.';
            notebookLink.href = r.notebook_url;
          } else if (event.step === 'error') {
            if (event.detail && event.detail.includes('expired')) {
              authBanner.textContent = 'Session expired. Re-export cookies from your browser.';
              authBanner.className = 'auth-banner auth-error';
              authBanner.classList.remove('hidden');
            }
            throw new Error(event.detail);
          }
        }
      }

    } catch (err) {
      progressStatus.textContent = 'Error';
      progressDetail.textContent = err.message;
      setTimeout(() => {
        progressPanel.classList.add('hidden');
        configPanel.classList.remove('hidden');
      }, 3000);
    }
  });

  newBtn.addEventListener('click', () => {
    resultPanel.classList.add('hidden');
    configPanel.classList.remove('hidden');
    selectedFiles = [];
    updateFileList();
    genMindmap.checked = true;
    genQuiz.checked = true;
    genFlashcards.checked = false;
    quizOptions.classList.remove('hidden');
    flashcardOptions.classList.add('hidden');
    notebookName.value = '';
    document.getElementById('quiz-instructions').value = '';
    document.getElementById('fc-instructions').value = '';
    pillValues['quiz-questions'] = '25';
    pillValues['quiz-difficulty'] = 'Medium';
    pillValues['fc-questions'] = '25';
    pillValues['fc-difficulty'] = 'Medium';
    document.querySelectorAll('.pill').forEach(p => {
      if (p.dataset.value === '25' || p.dataset.value === 'Medium') {
        p.classList.add('active');
      } else {
        p.classList.remove('active');
      }
    });
    updateSubmitBtn();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }
})();
