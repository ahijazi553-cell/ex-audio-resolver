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
      const track = json && json.data && json.data;
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
      const results = (json && json.data && json.data.results) || (json && json.results) || [];
      const song = results;
      if (song) {
        const dl = song.downloadUrl || [];
        const best = dl[dl.length - 1] || dl;
        const audioUrl = (best && (best.url || best.link)) || '';
        const imgs = song.image || [];
        const bestImg = imgs[imgs.length - 1] || imgs;
        const thumb = (bestImg && (bestImg.url || bestImg.link)) || '';
        const dur = Number(song.duration || 0);
        const mins = Math.floor(dur / 60);
        const secs = String(dur % 60).padStart(2, '0');
        if (audioUrl) {
          return {
            title: song.name || song.title || query,
            duration: `${mins}:${secs}`,
            views: (song.playCount || 'N/A').toString(),
            author: (song.primaryArtists || (song.artists && song.artists.primary && song.artists.primary.map(a => a.name).join(', '))) || 'Artist',
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
    const track = json && json.data && json.data;
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
        if (yt && yt.videos && yt.videos) {
          result.thumbnailUrl = yt.videos.thumbnail || yt.videos.image || '';
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
