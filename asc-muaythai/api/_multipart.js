// api/_multipart.js
// Parseur multipart/form-data minimal partagé par les endpoints d'upload
// (inscription publique + admin) : suffisant pour un fichier plus quelques
// champs texte, sans dépendance externe. Préfixé par "_" pour ne pas devenir
// lui-même une Serverless Function (convention Vercel), comme api/admin/_*.js.

export function readMultipartBody(req, maxSize) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxSize) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Découpe un corps multipart/form-data en parties { name, filename,
// contentType, data }. filename/contentType sont null pour un champ texte.
export function parseMultipartParts(buffer, contentType) {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType || '');
  const boundary = boundaryMatch && (boundaryMatch[1] || boundaryMatch[2]);
  if (!boundary) return [];

  const delimiter = Buffer.from(`--${boundary}`);
  const raw = [];
  let start = buffer.indexOf(delimiter);
  while (start !== -1) {
    const next = buffer.indexOf(delimiter, start + delimiter.length);
    if (next === -1) break;
    raw.push(buffer.slice(start + delimiter.length, next));
    start = next;
  }

  const parts = [];
  for (const part of raw) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const header = part.slice(0, headerEnd).toString('utf8');
    const nameMatch = /name="([^"]*)"/.exec(header);
    if (!nameMatch) continue;

    let body = part.slice(headerEnd + 4);
    if (body.slice(-2).toString('utf8') === '\r\n') body = body.slice(0, -2);

    const typeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(header);
    const filenameMatch = /filename="([^"]*)"/.exec(header);
    parts.push({
      name: nameMatch[1],
      filename: filenameMatch ? filenameMatch[1] : null,
      contentType: typeMatch ? typeMatch[1].trim() : null,
      data: body,
    });
  }
  return parts;
}
