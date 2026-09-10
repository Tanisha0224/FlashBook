'use strict';
(() => {
  const el = id => document.getElementById(id);
  let version = 0, expires = 0, pending = false;
  const message = text => { el('qr-status').textContent = text; };
  window.invalidateQrShare = () => {
    version++;
    el('qr-result').hidden = true;
    el('qr-link').removeAttribute('href');
    expires = 0;
    message('Create a QR to send this version of your strip to your phone.');
  };
  el('create-qr').onclick = async () => {
    if (pending || el('strip').hidden) return;
    pending = true; el('create-qr').disabled = true;
    const current = version;
    message('Creating your phone download link…');
    try {
      const configResponse = await fetch('/api/config', {cache:'no-store'});
      if (!configResponse.ok) throw Error('QR sharing needs the Flashbox sharing server. Direct PNG download still works.');
      const config = await configResponse.json();
      if (!config.qr_enabled) throw Error('QR sharing will be available after the hosted server address is configured. You can still download your PNG.');
      const blob = await new Promise((resolve, reject) => el('strip').toBlob(value => value ? resolve(value) : reject(Error('Could not prepare your strip.')), 'image/png'));
      if (current !== version) return;
      const response = await fetch('/api/share', {method:'POST',headers:{'Content-Type':'image/png'},body:blob});
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Could not create a sharing link. Please try again.');
      if (current !== version) return;
      el('qr-image').src = data.qr;
      el('qr-link').href = data.url;
      expires = data.expires_at;
      el('qr-result').hidden = false;
      message('Scan with your phone’s camera, then tap Save photo. This link expires in 1 hour.');
    } catch (error) {
      if (current === version) message(error instanceof TypeError ? 'Could not reach the sharing server. Check your connection and try again.' : error.message);
    } finally {pending = false;el('create-qr').disabled = false;}
  };
  el('copy-qr-link').onclick = async () => {
    if (!expires || Date.now() >= expires) return;
    try {await navigator.clipboard.writeText(el('qr-link').href);message('Link copied. Anyone with this link can view and save the photo.');}
    catch {message('Copying is unavailable here. Open the photo link and copy its address.');}
  };
  el('qr-image').onerror = () => {el('qr-result').hidden=true;message('Could not load the QR code. Try creating it again.');};
  setInterval(() => {
    if (expires && Date.now() >= expires) {window.invalidateQrShare();message('This QR link expired. Create a new one to share again.');}
  }, 10000);
})();
