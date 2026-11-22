const express = require('express');
const yts = require('yt-search');

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'ex-audio-resolver' });
});

async function searchAudius(query) {
  const hosts = [
    'https://audius.co',
    'https://audius.co',
    'https://audius.co',
  ];
  for (const host of hosts) {
    try {
      const r = await fetch(`${host}/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=EX_PLAYROOM`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) continue;
      const json = await r.json();
      const list = Array.isArray(json && json.data) ? json.data : [];
      const track = list.at(0);
      if (track && track.id) {
        const mins = Math.floor((track.duration || 0) / 60);
        const secs = String((track.duration || 0) % 60).padStart(2, '0');
        return {
          title: track.title,
          duration: `${mins}:${secs}`,
          views: (track.play_count || 0).toLocaleString(),
          author: (track.user && track.user.name) || 'Artist',
          thumbnailUrl: (track.artwork && (track.artwork['480x480'] || track.artwork['150x150'])) || '',
          audioUrl: `${host}/v1/tracks/${track.id}/stream?app_name=EX_PLAYROOM`,
        };
      }
    } catch {}
  }
  return null;
}

async function searchSaavn(query) {
  const apis = [
    `https://saavn.dev{encodeURIComponent(query)}`,
    `https://vercel.app{encodeURIComponent(query)}`,
  ];
  for (const url of apis) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const json = await r.json();
      const raw = (json && json.data && json.data.results) || (json && json.results) || [];
      const song = Array.isArray(raw) ? raw.at(0) : null;
      if (song) {
        const dl = Array.isArray(song.downloadUrl) ? song.downloadUrl : [];
        const best = dl.at(-1) || dl.at(0);
        const audioUrl = (best && (best.url || best.link)) || '';
        const imgs = Array.isArray(song.image) ? song.image : [];
        const bestImg = imgs.at(-1) || imgs.at(0);
        const thumb = (bestImg && (bestImg.url || bestImg.link)) || '';
        const dur = Number(song.duration || 0);
        const mins = Math.floor(dur / 60);
        const secs = String(dur % 60).padStart(2, '0');
        if (audioUrl) {
          return {
            title: song.name || song.title || query,
            duration: `${mins}:${secs}`,
            views: (song.playCount || 'N/A').toString(),
            author: (song.primaryArtists || (song.artists && Array.isArray(song.artists.primary) && song.artists.primary.map(a => a.name).join(', '))) || 'Artist',
            thumbnailUrl: thumb,
            audioUrl,
          };
        }
      }
    } catch {}
  }
  return null;
}

async function searchDeezerPreview(query) {
  try {
    const r = await fetch(`https://deezer.com{encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const json = await r.json();
    const list = Array.isArray(json && json.data) ? json.data : [];
    const track = list.at(0);
    if (track && track.preview) {
      return {
        title: track.title,
        duration: '0:30 (Preview)',
        views: (track.rank || 0).toLocaleString(),
        author: (track.artist && track.artist.name) || 'Artist',
        thumbnailUrl: (track.album && (track.album.cover_big || track.album.cover_medium)) || '',
        audioUrl: track.preview,
      };
    }
  } catch {}
  return null;
}

app.get('/resolve', async (req, res) => {
  try {
    const query = String(req.query.q || req.query.query || '').trim();
    if (!query) return res.status(400).json({ error: 'Missing query' });

    let result = await searchAudius(query);
    if (!result) result = await searchSaavn(query);
    if (!result) result = await searchDeezerPreview(query);

    if (!result) {
      return res.status(404).json({ error: 'No playable audio found' });
    }

    if (!result.thumbnailUrl) {
      try {
        const yt = await yts(query);
        const ytList = Array.isArray(yt && yt.videos) ? yt.videos : [];
        const firstYt = ytList.at(0);
        if (firstYt) {
          result.thumbnailUrl = firstYt.thumbnail || firstYt.image || '';
        }
      } catch {}
    }

    res.json({
      ...result,
      url: result.audioUrl,
    });
  } catch (err) {
    console.error('Resolve error:', err);
    res.status(500).json({ error: 'Failed to resolve audio' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ex-audio-resolver listening on ${PORT}`);
});
           
