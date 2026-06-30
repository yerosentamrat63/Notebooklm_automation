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
  const quizDifficulty = document.getElementById('quiz-difficulty');
  const quizQuantity = document.getElementById('quiz-quantity');
  const flashcardDifficulty = document.getElementById('flashcard-difficulty');
  const flashcardQuantity = document.getElementById('flashcard-quantity');
  const submitBtn = document.getElementById('submit-btn');
  const progressPanel = document.getElementById('progress-panel');
  const progressStatus = document.getElementById('progress-status');
  const progressDetail = document.getElementById('progress-detail');
  const progressSteps = document.getElementById('progress-steps');
  const resultPanel = document.getElementById('result-panel');
  const resultText = document.getElementById('result-text');
  const notebookLink = document.getElementById('notebook-link');
  const newBtn = document.getElementById('new-btn');

  let selectedFiles = [];

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
      `;
      ul.appendChild(item);
    });
    fileList.appendChild(ul);
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
    for (const f of files) {
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      if (['.pdf', '.docx', '.ppt', '.pptx'].includes(ext)) {
        if (!selectedFiles.find(sf => sf.name === f.name && sf.size === f.size)) {
          valid.push(f);
        }
      }
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

  function setProgress(step, detail) {
    progressPanel.classList.remove('hidden');
    configPanel.classList.add('hidden');
    resultPanel.classList.add('hidden');
    progressStatus.textContent = step;
    progressDetail.textContent = detail || '';
  }

  function updateProgressSteps(steps) {
    progressSteps.innerHTML = '';
    steps.forEach(s => {
      const div = document.createElement('div');
      div.className = 'progress-step ' + (s.status || '');
      div.innerHTML = `
        <span class="step-icon">${s.icon}</span>
        <span>${s.text}</span>
      `;
      progressSteps.appendChild(div);
    });
  }

  submitBtn.addEventListener('click', async () => {
    if (selectedFiles.length === 0) return;

    const name = notebookName.value.trim() || 'Study Notebook';

    setProgress('Creating notebook...', 'Uploading files to NotebookLM');
    updateProgressSteps([
      { text: 'Creating notebook', icon: '⬜', status: 'active' },
      { text: 'Uploading sources', icon: '⬜' },
      { text: 'Generating content', icon: '⬜' },
      { text: 'Done!', icon: '⬜' },
    ]);

    const formData = new FormData();
    for (const f of selectedFiles) {
      formData.append('files', f);
    }
    formData.append('notebook_name', name);
    formData.append('generate_mindmap', genMindmap.checked ? 'true' : 'false');
    formData.append('generate_quiz', genQuiz.checked ? 'true' : 'false');
    formData.append('quiz_difficulty', quizDifficulty.value);
    formData.append('quiz_quantity', quizQuantity.value);
    formData.append('generate_flashcards', genFlashcards.checked ? 'true' : 'false');
    formData.append('flashcards_difficulty', flashcardDifficulty.value);
    formData.append('flashcards_quantity', flashcardQuantity.value);

    try {
      const res = await fetch('/upload', {
        method: 'POST',
        body: formData,
      });

      updateProgressSteps([
        { text: 'Creating notebook', icon: '✅', status: 'done' },
        { text: 'Uploading sources', icon: '✅', status: 'done' },
        { text: 'Generating content', icon: '⏳', status: 'active' },
        { text: 'Done!', icon: '⬜' },
      ]);

      setProgress('Generating content...', 'This may take a minute');

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Upload failed');
      }

      const data = await res.json();

      updateProgressSteps([
        { text: 'Creating notebook', icon: '✅', status: 'done' },
        { text: 'Uploading sources', icon: '✅', status: 'done' },
        { text: 'Generating content', icon: '✅', status: 'done' },
        { text: 'Done!', icon: '✅', status: 'done' },
      ]);

      const generated = [];
      if (data.generated.mind_map) generated.push('Mind Map');
      if (data.generated.quiz) generated.push('Quiz');
      if (data.generated.flashcards) generated.push('Flashcards');

      progressPanel.classList.add('hidden');
      resultPanel.classList.remove('hidden');
      resultText.textContent = `"${data.notebook_name}" created with ${generated.join(', ')}. Open it in NotebookLM to view.`;
      notebookLink.href = data.notebook_url;

    } catch (err) {
      setProgress('Error', err.message);
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
    updateSubmitBtn();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }
})();
