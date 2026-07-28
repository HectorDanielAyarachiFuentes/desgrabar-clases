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

  // Load saved API Key
  if (extensionApi?.storage?.local) {
    extensionApi.storage.local.get(['deepgramKey']).then((x) => {
      if (x && x.deepgramKey) {
        apiKeyInput.value = x.deepgramKey;
      }
    }).catch(err => console.error("Error loading key:", err));
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
    setStatus('Procesando archivo... Por favor espera.', '');

    try {
      const response = await fetch(
        'https://api.deepgram.com/v1/listen?model=nova-2&language=es&smart_format=true&punctuate=true',
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${key}`,
            'Content-Type': file.type || 'application/octet-stream'
          },
          body: file
        }
      );

      const data = await response.json();

      if (response.ok) {
        const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript;
        if (transcript !== undefined) {
          resultTextArea.value = transcript;
          setStatus('¡Transcripción completada con éxito!', 'success');
        } else {
          setStatus('La API no devolvió texto transcrito.', 'error');
        }
      } else {
        const errMsg = data.err_msg || data.message || data.error || 'Error en la respuesta de la API';
        setStatus(`Error Deepgram: ${errMsg}`, 'error');
      }
    } catch (e) {
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
      const lineHeight = 7;
      let cursorY = 20;

      // Title
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(2, 132, 199);
      doc.text('Transcripción de Audio / Video', margin, cursorY);
      cursorY += 7;

      // Metadata / Date
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

      // Content
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);

      const paragraphs = text.split('\n');
      for (const paragraph of paragraphs) {
        if (!paragraph.trim()) {
          cursorY += 4;
          continue;
        }
        const lines = doc.splitTextToSize(paragraph, maxLineWidth);
        for (const line of lines) {
          if (cursorY + lineHeight > pageHeight - margin) {
            doc.addPage();
            cursorY = margin + 5;
          }
          doc.text(line, margin, cursorY);
          cursorY += lineHeight;
        }
        cursorY += 3;
      }

      doc.save(getExportFilename('pdf'));
      setStatus('PDF descargado con éxito.', 'success');
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
        .split('\n')
        .map(p => p.trim() ? `<p>${escapeHtml(p)}</p>` : '<p>&nbsp;</p>')
        .join('');

      const docHtml = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-microsoft-com:office:office'
      xmlns:w='urn:schemas-microsoft-microsoft-com:office:word'
      xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset='utf-8'>
  <title>Transcripción</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; line-height: 1.6; color: #0f172a; padding: 25px; }
    h1 { color: #0284c7; font-size: 18pt; border-bottom: 2px solid #0284c7; padding-bottom: 6px; margin-bottom: 12px; }
    .meta { color: #64748b; font-size: 9.5pt; margin-bottom: 24px; }
    p { margin-bottom: 10pt; text-align: justify; }
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

      setStatus('Documento Word descargado con éxito.', 'success');
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