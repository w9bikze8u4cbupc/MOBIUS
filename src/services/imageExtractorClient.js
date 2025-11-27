import axios from 'axios';

export async function fetchImagesFromExtractor(url, apiKey, mode = 'basic') {
  if (!url) {
    throw new Error('Extractor URL is required');
  }
  if (!apiKey) {
    throw new Error('Extractor API key missing');
  }

  const start = await axios.post(
    'https://api.extract.pics/v0/extractions',
    { url, mode },
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );

  const extractionId = start?.data?.data?.id;
  if (!extractionId) {
    throw new Error('Failed to start extraction');
  }

  let status = start.data.data.status;
  let attempts = 0;
  let images = [];

  while (status !== 'done' && status !== 'failed' && attempts < 15) {
    attempts += 1;
    await new Promise((res) => setTimeout(res, 1000));
    const poll = await axios.get(`https://api.extract.pics/v0/extractions/${extractionId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    status = poll?.data?.data?.status;
    images = poll?.data?.data?.images || [];
  }

  if (status !== 'done') {
    throw new Error('Extraction failed or timed out');
  }

  return images.map((img) => ({
    originalUrl: img.url,
    width: img.width || null,
    height: img.height || null,
  }));
}

