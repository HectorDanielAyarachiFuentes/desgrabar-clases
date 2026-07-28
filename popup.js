document.addEventListener('DOMContentLoaded', () => {
  const extensionApi = typeof browser !== 'undefined' ? browser : chrome;
  
  const apiKeyInput = document.getElementById('apiKey');
  const fileInput = document.getElementById('audioFile');
  const btnTranscribe = document.getElementById('btnTranscribe');
  const btnCopy = document.getElementById('btnCopy');
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
    if (!resultTextArea.value) return;
    try {
      await navigator.clipboard.writeText(resultTextArea.value);
      const originalText = btnCopy.textContent;
      btnCopy.textContent = '¡Texto Copiado!';
      setTimeout(() => {
        btnCopy.textContent = originalText;
      }, 2000);
    } catch (err) {
      console.error('Error al copiar:', err);
    }
  });

  function setStatus(message, type = '') {
    statusDiv.textContent = message;
    statusDiv.className = type;
  }
});