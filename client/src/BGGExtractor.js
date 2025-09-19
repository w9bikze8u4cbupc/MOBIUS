import React, { useState } from 'react';
import { extractMetadata } from './api/client';

const BGGExtractor = () => {
  const [bggUrl, setBggUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({
    gameName: '',
    imageUrl: '',
    description: '',
    yearPublished: '',
    minPlayers: '',
    maxPlayers: '',
    minPlayTime: '',
    maxPlayTime: '',
    minAge: '',
    publishers: [],
    designers: [],
    artists: [],
    categories: [],
    mechanics: [],
    rating: '',
    rank: '',
    bggId: '',
    bggUrl: '',
  });

  const handleExtract = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await extractMetadata(bggUrl);
      if (data.success) {
        setFields({
          gameName: data.title || '',
          imageUrl: data.cover_image || '',
          description: data.description || '',
          yearPublished: data.year || '',
          minPlayers: data.player_count.split('-')[0] || '',
          maxPlayers: data.player_count.split('-')[1] || '',
          minPlayTime: data.play_time.split('-')[0]?.replace('min', '').trim() || '',
          maxPlayTime: data.play_time.split('-')[1]?.replace('min', '').trim() || '',
          minAge: data.min_age?.replace('+', '').trim() || '',
          publishers: data.publisher || [],
          designers: data.designers || [],
          artists: data.artists || [],
          categories: data.theme || [],
          mechanics: data.mechanics || [],
          rating: data.average_rating || '',
          rank: data.bgg_rank || '',
          bggId: data.bgg_id || '',
          bggUrl: data.bggUrl || bggUrl,
        });
      } else {
        setError(data.error || 'Extraction failed');
      }
    } catch (err) {
      setError('Error extracting game info: ' + err.message);
    }
    setLoading(false);
  };

  // Helper for array fields
  const arrayToString = arr => Array.isArray(arr) ? arr.join(', ') : '';

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24, border: '1px solid #ccc', borderRadius: 8 }}>
      <h2>BoardGameGeek Auto-Fill</h2>
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          value={bggUrl}
          onChange={e => setBggUrl(e.target.value)}
          placeholder="Paste BGG game URL here"
          style={{ width: '80%', padding: 8, fontSize: 16 }}
        />
        <button
          onClick={handleExtract}
          disabled={loading || !bggUrl}
          style={{ marginLeft: 8, padding: '8px 16px', fontSize: 16 }}
        >
          {loading ? 'Extracting...' : 'Extract'}
        </button>
      </div>
      {error && <div style={{ color: 'red', marginBottom: 16 }}>{error}</div>}
      <form>
        <div>
          <label>Game Name:</label>
          <input type="text" value={fields.gameName} readOnly style={{ width: '100%' }} />
        </div>
        <div>
          <label>Year Published:</label>
          <input type="text" value={fields.yearPublished} readOnly style={{ width: '100%' }} />
        </div>
        <div>
          <label>Players:</label>
          <input type="text" value={`${fields.minPlayers} - ${fields.maxPlayers}`} readOnly style={{ width: '100%' }} />
        </div>
        <div>
          <label>Play Time (min-max):</label>
          <input type="text" value={`${fields.minPlayTime} - ${fields.maxPlayTime}`} readOnly style={{ width: '100%' }} />
        </div>
        <div>
          <label>Minimum Age:</label>
          <input type="text" value={fields.minAge} readOnly style={{ width: '100%' }} />
        </div>
        <div>
          <label>Publishers:</label>
          <input type="text" value={arrayToString(fields.publishers)} readOnly style={{ width: '100%' }} />
        </div>
        <div>
          <label>Designers:</label>
          <input type="text" value={arrayToString(fields.designers)} readOnly style={{ width: '100%' }} />
        </div>
        <div>
          <label>Artists:</label>
          <input type="text" value={arrayToString(fields.artists)} readOnly style={{ width: '100%' }} />
        </div>
        <div>
          <label>Categories:</label>
          <input type="text" value={arrayToString(fields.categories)} readOnly style={{ width: '100%' }} />
        </div>
        <div>
          <label>Mechanics:</label>
          <input type="text" value={arrayToString(fields.mechanics)} readOnly style={{ width: '100%' }} />
        </div>
        <div>
          <label>Rating:</label>
          <input type="text" value={fields.rating} readOnly style={{ width: '100%' }} />
        </div>
        <div>
          <label>Rank:</label>
          <input type="text" value={fields.rank} readOnly style={{ width: '100%' }} />
        </div>
        <div>
          <label>Description:</label>
          <textarea value={fields.description} readOnly style={{ width: '100%', minHeight: 60 }} />
        </div>
        <div>
          <label>Image:</label><br />
          {fields.imageUrl && (
            <img src={fields.imageUrl} alt="Game" style={{ maxWidth: 200, marginTop: 8 }} />
          )}
        </div>
        <div>
          <label>BGG ID:</label>
          <input type="text" value={fields.bggId} readOnly style={{ width: '100%' }} />
        </div>
        <div>
          <label>BGG URL:</label>
          <input type="text" value={fields.bggUrl} readOnly style={{ width: '100%' }} />
        </div>
      </form>
    </div>
  );
};

export default BGGExtractor;