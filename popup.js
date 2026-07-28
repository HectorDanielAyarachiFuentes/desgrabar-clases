document.addEventListener('DOMContentLoaded', () => {
  const extensionApi = typeof browser !== 'undefined' ? browser : chrome;
  
  const apiKeyInput = document.getElementById('apiKey');
  const fileInput = document.getElementById('audioFile');
  const btnTranscribe = document.getElementById('btnTranscribe');
  const btnCopy = document.getElementById('btnCopy');
  const btnPdf = document.getElementById('btnPdf');
  const btnWord = document.getElementById('btnWord');
  const statusDiv = document.getElementById('status');
  const resultTextArea = document.getElementById('resultText');

  // Progress and Timer elements
  const progressContainer = document.getElementById('progressContainer');
  const progressStatus = document.getElementById('progressStatus');
  const timerDisplay = document.getElementById('timerDisplay');
  const progressBarFill = document.getElementById('progressBarFill');

  let timerInterval = null;
  let startTime = 0;

  // Load saved API Key
  if (extensionApi?.storage?.local) {
    extensionApi.storage.local.get(['deepgramKey']).then((x) => {
      if (x && x.deepgramKey) {
        apiKeyInput.value = x.deepgramKey;
      }
    }).catch(err => console.error("Error cargando key:", err));
  }

  // Save API Key on change/input
  const saveKey = () => {
    const val = apiKeyInput.value.trim();
    if (extensionApi?.storage?.local) {
      extensionApi.storage.local.set({ deepgramKey: val });
    }
  };
  apiKeyInput.addEventListener('change', saveKey);
  apiKeyInput.addEventListener('input', saveKey);

  // Timer functions
  function startTimer() {
    stopTimer();
    startTime = Date.now();
    timerDisplay.textContent = '⏱️ 00:00';
    timerInterval = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      const mins = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
      const secs = String(elapsedSeconds % 60).padStart(2, '0');
      timerDisplay.textContent = `⏱️ ${mins}:${secs}`;
    }, 500);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    const totalMs = Date.now() - startTime;
    const totalSecs = (totalMs / 1000).toFixed(1);
    if (totalMs < 60000) {
      return `${totalSecs} seg`;
    } else {
      const mins = Math.floor(totalMs / 60000);
      const secs = ((totalMs % 60000) / 1000).toFixed(0);
      return `${mins}m ${secs}s`;
    }
  }

  // Smart Paragraph Formatter
  function formatIntoParagraphs(rawText) {
    if (!rawText) return '';
    
    // Check if rawText already contains double line breaks
    if (rawText.includes('\n\n')) {
      return rawText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).join('\n\n');
    }

    // Check single newlines
    if (rawText.includes('\n')) {
      return rawText.split('\n').map(p => p.trim()).filter(Boolean).join('\n\n');
    }

    // Split continuous wall of text into sentences (. ! ?)
    const sentenceRegex = /([^.!?]+[.!?]+(?:\s+|$))/g;
    const sentences = rawText.match(sentenceRegex);

    if (!sentences || sentences.length <= 1) {
      return rawText;
    }

    const paragraphs = [];
    let currentParagraph = [];

    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i].trim();
      if (!s) continue;
      currentParagraph.push(s);

      // Create a paragraph every 3 to 4 sentences for optimal readability
      if (currentParagraph.length >= 4 || i === sentences.length - 1) {
        paragraphs.push(currentParagraph.join(' '));
        currentParagraph = [];
      }
    }

    return paragraphs.join('\n\n');
  }

  // Extract best formatted transcript from Deepgram response
  function extractTranscript(data) {
    const alt = data.results?.channels?.[0]?.alternatives?.[0];
    if (!alt) return null;

    // 1. Check structured paragraphs from Deepgram API
    if (alt.paragraphs?.transcript && alt.paragraphs.transcript.trim()) {
      return formatIntoParagraphs(alt.paragraphs.transcript);
    }

    // 2. Check paragraph array
    if (alt.paragraphs?.paragraphs && Array.isArray(alt.paragraphs.paragraphs)) {
      const paraTexts = alt.paragraphs.paragraphs.map(p => {
        if (p.sentences) {
          return p.sentences.map(s => s.text).join(' ');
        }
        return p.text || '';
      }).filter(Boolean);

      if (paraTexts.length > 0) {
        return paraTexts.join('\n\n');
      }
    }

    // 3. Fallback to general transcript with sentence-based formatting
    if (alt.transcript) {
      return formatIntoParagraphs(alt.transcript);
    }

    return null;
  }

  // Transcribe button handler
  btnTranscribe.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    const file = fileInput.files[0];

    if (!key) {
      setStatus('Ingresa tu API Key de Deepgram', 'error');
      apiKeyInput.focus();
      return;
    }

    if (!file) {
      setStatus('Selecciona un archivo de audio o video', 'error');
      fileInput.focus();
      return;
    }

    btnTranscribe.disabled = true;
    setStatus('', '');
    
    // Show progress bar and start timer
    progressContainer.classList.remove('hidden');
    progressStatus.textContent = 'Enviando y procesando archivo...';
    progressBarFill.className = 'progress-bar-fill indeterminate';
    startTimer();

    try {
      // Request Deepgram with paragraphs, smart_format, and punctuate
      const apiUrl = 'https://api.deepgram.com/v1/listen?model=nova-2&language=es&smart_format=true&punctuate=true&paragraphs=true&diarize=true';
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Token ${key}`,
          'Content-Type': file.type || 'application/octet-stream'
        },
        body: file
      });

      const data = await response.json();
      const elapsedStr = stopTimer();

      if (response.ok) {
        const transcript = extractTranscript(data);
        if (transcript) {
          resultTextArea.value = transcript;
          progressBarFill.className = 'progress-bar-fill success';
          progressStatus.textContent = `¡Completado en ${elapsedStr}!`;
          setStatus('✨ Transcripción formateada y lista para descargar.', 'success');
        } else {
          progressBarFill.className = 'progress-bar-fill error';
          progressStatus.textContent = 'Error de respuesta';
          setStatus('La API no devolvió texto transcrito.', 'error');
        }
      } else {
        progressBarFill.className = 'progress-bar-fill error';
        progressStatus.textContent = 'Error API';
        const errMsg = data.err_msg || data.message || data.error || 'Error en la respuesta de la API';
        setStatus(`Error Deepgram: ${errMsg}`, 'error');
      }
    } catch (e) {
      const elapsedStr = stopTimer();
      progressBarFill.className = 'progress-bar-fill error';
      progressStatus.textContent = 'Error de red';
      setStatus(`Error de red o procesamiento: ${e.message}`, 'error');
    } finally {
      btnTranscribe.disabled = false;
    }
  });

  // Copy text handler
  btnCopy.addEventListener('click', async () => {
    if (!resultTextArea.value.trim()) {
      setStatus('No hay texto para copiar.', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(resultTextArea.value);
      const originalText = btnCopy.textContent;
      btnCopy.textContent = '¡Texto Copiado!';
      setStatus('Texto copiado al portapapeles.', 'success');
      setTimeout(() => {
        btnCopy.textContent = originalText;
      }, 2000);
    } catch (err) {
      console.error('Error al copiar:', err);
    }
  });

  // Helper for export filename
  function getExportFilename(extension) {
    const file = fileInput.files[0];
    if (file && file.name) {
      const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      return `transcripcion_${baseName}.${extension}`;
    }
    const dateStr = new Date().toISOString().slice(0, 10);
    return `transcripcion_${dateStr}.${extension}`;
  }

  // PDF Export handler
  btnPdf.addEventListener('click', () => {
    const text = resultTextArea.value.trim();
    if (!text) {
      setStatus('No hay texto para exportar a PDF.', 'error');
      return;
    }

    try {
      if (!window.jspdf || !window.jspdf.jsPDF) {
        throw new Error('Librería jsPDF no disponible.');
      }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const maxLineWidth = pageWidth - margin * 2;
      const lineHeight = 6.5;
      let cursorY = 20;

      // Header Title
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(2, 132, 199);
      doc.text('Transcripción de Audio / Video', margin, cursorY);
      cursorY += 7;

      // Metadata
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      const fileNameStr = fileInput.files[0]?.name ? `Archivo: ${fileInput.files[0].name} | ` : '';
      doc.text(`${fileNameStr}Fecha: ${new Date().toLocaleString('es-ES')}`, margin, cursorY);
      cursorY += 8;

      // Line separator
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.line(margin, cursorY, pageWidth - margin, cursorY);
      cursorY += 10;

      // Content Body (Paragraph formatted)
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(15, 23, 42);

      const paragraphs = text.split(/\n\s*\n/);
      for (const paragraph of paragraphs) {
        const cleanParagraph = paragraph.trim();
        if (!cleanParagraph) continue;

        const lines = doc.splitTextToSize(cleanParagraph, maxLineWidth);
        for (const line of lines) {
          if (cursorY + lineHeight > pageHeight - margin) {
            doc.addPage();
            cursorY = margin + 5;
          }
          doc.text(line, margin, cursorY);
          cursorY += lineHeight;
        }
        cursorY += 4; // Space between paragraphs in PDF
      }

      doc.save(getExportFilename('pdf'));
      setStatus('PDF descargado con éxito con formato de párrafos.', 'success');
    } catch (err) {
      console.error('Error exportando PDF:', err);
      setStatus(`Error exportando PDF: ${err.message}`, 'error');
    }
  });

  // Word Export handler
  btnWord.addEventListener('click', () => {
    const text = resultTextArea.value.trim();
    if (!text) {
      setStatus('No hay texto para exportar a Word.', 'error');
      return;
    }

    try {
      const escapeHtml = (str) =>
        str.replace(/&/g, '&amp;')
           .replace(/</g, '&lt;')
           .replace(/>/g, '&gt;')
           .replace(/"/g, '&quot;')
           .replace(/'/g, '&#039;');

      const fileInfoStr = fileInput.files[0]?.name ? `<div><strong>Archivo:</strong> ${escapeHtml(fileInput.files[0].name)}</div>` : '';
      const dateStr = new Date().toLocaleString('es-ES');

      const paragraphsHtml = text
        .split(/\n\s*\n/)
        .map(p => p.trim() ? `<p style="margin-bottom: 14pt; text-align: justify; line-height: 1.6;">${escapeHtml(p)}</p>` : '')
        .filter(Boolean)
        .join('');

      const docHtml = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-microsoft-com:office:office'
      xmlns:w='urn:schemas-microsoft-microsoft-com:office:word'
      xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset='utf-8'>
  <title>Transcripción</title>
  <style>
    body { font-family: 'Calibri', 'Segoe UI', Arial, sans-serif; font-size: 11pt; line-height: 1.6; color: #0f172a; padding: 25px; }
    h1 { color: #0284c7; font-size: 18pt; border-bottom: 2px solid #0284c7; padding-bottom: 6px; margin-bottom: 12px; }
    .meta { color: #64748b; font-size: 9.5pt; margin-bottom: 24px; }
    p { margin-bottom: 14pt; text-align: justify; }
  </style>
</head>
<body>
  <h1>Transcripción de Audio / Video</h1>
  <div class="meta">
    ${fileInfoStr}
    <div><strong>Fecha de exportación:</strong> ${dateStr}</div>
  </div>
  <hr style="border: none; border-top: 1px solid #cbd5e1; margin-bottom: 20px;" />
  ${paragraphsHtml}
</body>
</html>`;

      const blob = new Blob(['\ufeff' + docHtml], { type: 'application/msword;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = getExportFilename('doc');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatus('Documento Word descargado con éxito con formato de párrafos.', 'success');
    } catch (err) {
      console.error('Error exportando Word:', err);
      setStatus(`Error exportando Word: ${err.message}`, 'error');
    }
  });

  function setStatus(message, type = '') {
    statusDiv.textContent = message;
    statusDiv.className = type;
  }
});