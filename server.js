const express = require('express');
const yts = require('yt-search');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;
const TMP_DIR = '/tmp/ex-audio';

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

setInterval(() => {
  const now = Date.now();
  for (const file of fs.readdirSync(TMP_DIR)) {
    const full = path.join(TMP_DIR, file);
    try {
      const stat = fs.statSync(full);
      if (now - stat.mtimeMs > 15 * 60 * 1000) fs.unlinkSync(full);
    } catch {}
  }
}, 5 * 60 * 1000);

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'ex-audio-resolver' });
});

app.get('/audio/:file', (req, res) => {
  const safeName = path.basename(req.params.file);
  const filePath = path.join(TMP_DIR, safeName);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.setHeader('Content-Type', 'audio/mpeg');
  fs.createReadStream(filePath).pipe(res);
});

async function resolveViaPublicApis(videoUrl, videoId) {
  const cobaltInstances = [
    'https://cobalt.tools',
    'https://kwiatekmiki.com',
    'https://timelessnesses.me',
  ];
  for (const endpoint of cobaltInstances) {
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: videoUrl,
          downloadMode: 'audio',
          audioFormat: 'mp3',
          audioBitrate: '128',
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.url) return data.url;
      }
    } catch {}
  }

  const pipedInstances = [
    'https://kavin.rocks',
    'https://adminforge.de',
    'https://private.coffee',
  ];
  for (const base of pipedInstances) {
    try {
      const resp = await fetch(`${base}/streams/${videoId}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (resp.ok) {
        const data = await resp.json();
        const streams = (data.audioStreams || []).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        if (streams && streams.url) return streams.url;
      }
    } catch {}
  }
  return null;
}

app.get('/resolve', async (req, res) => {
  try {
    const query = String(req.query.q || req.query.query || '').trim();
    if (!query) return res.status(400).json({ error: 'Missing query' });

    const search = await yts(query);
    const video = search.videos && search.videos;
    if (!video) return res.status(404).json({ error: 'No track found' });
    if (video.seconds > 3600) {
      return res.status(400).json({ error: 'Track exceeds 60 minutes limit' });
    }

    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.get('host');
    let audioUrl = await resolveViaPublicApis(video.url, video.videoId);

    if (!audioUrl) {
      const id = crypto.randomBytes(8).toString('hex');
      const outFile = path.join(TMP_DIR, `${id}.mp3`);
      const args = [
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '128K',
        '--no-playlist',
        '-o', outFile,
        video.url,
      ];
      if (process.env.YT_COOKIES) {
        const cookiePath = '/tmp/yt-cookies.txt';
        fs.writeFileSync(cookiePath, process.env.YT_COOKIES);
        args.unshift('--cookies', cookiePath);
      }
      await new Promise((resolve, reject) => {
        execFile('yt-dlp', args, { timeout: 120000 }, (err, _o, stderr) => {
          if (err) {
            console.error('yt-dlp stderr:', stderr);
            reject(err);
          } else {
            resolve();
          }
        });
      });
      audioUrl = `${proto}://${host}/audio/${id}.mp3`;
    }

    res.json({
      title: video.title,
      duration: video.timestamp || '0:00',
      views: video.views ? video.views.toLocaleString() : 'N/A',
      author: (video.author && video.author.name) || 'YouTube',
      thumbnailUrl: video.thumbnail || video.image,
      audioUrl,
      url: audioUrl,
    });
  } catch (err) {
    console.error('Resolve error:', err);
    res.status(500).json({ error: 'Failed to resolve audio' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ex-audio-resolver listening on ${PORT}`);
});
